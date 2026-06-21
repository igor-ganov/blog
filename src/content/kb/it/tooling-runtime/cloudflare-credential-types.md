---
title: "Conosci la tua credenziale Cloudflare: non bocciarla con il test sbagliato"
category: tooling-runtime
summary: 'cfk_ è una Global API Key; cfat_/cfut_ sono token Bearer. wrangler whoami è il test sbagliato per un token di deploy ristretto.'
principle: "cfk_ è una Global API Key (header X-Auth-Email + X-Auth-Key, mai Bearer); cfat_/cfut_ sono token Bearer. `wrangler whoami` è il test sbagliato per un token di deploy ristretto. Crea un token con scope limitato a partire dalla Global Key per l'uso quotidiano."
severity: context
tags: [cloudflare, wrangler, api-key, auth, credentials, deploy]
sources:
  - project: 'un bot edge (Cloudflare Workers)'
    date: 2026-05-23
    note: 'tipi di credenziale cfk_/cfat_/cfut_; verifica corretta; whoami è il test sbagliato'
  - project: 'una piattaforma di food delivery'
    date: 2026-05-29
    note: 'crea un token con scope limitato dalla Global Key; CLOUDFLARE_API_KEY+EMAIL per wrangler'
related:
  - tooling-runtime/bun-by-default
  - build-ci-deploy/build-time-env-is-baked
order: 4
updated: 2026-06-10
---

## Perché è importante

Il 2026-05-23, durante la configurazione di un bot edge (Cloudflare Workers), una credenziale
Cloudflare è stata liquidata come non valida perché `wrangler whoami` restituiva un errore di
autenticazione. La credenziale era a posto. Era un token di deploy ristretto per Workers/Pages, e
`wrangler whoami` chiama gli endpoint `/accounts` e `/user`, che un token del genere non ha lo
scope per raggiungere.

Una cosa simile è successa il 2026-05-29 durante il deploy di una piattaforma di food delivery,
solo che l'errore è andato nella direzione opposta: una Global API Key `cfk_` è stata testata con
un header Bearer, che è lo schema sbagliato per le Global Key.

Entrambi gli episodi hanno la stessa causa di fondo. Cloudflare ha tre tipi di credenziale,
ciascuno con il proprio schema di autenticazione, il proprio scope e il proprio endpoint di
validazione corretto. Scegli il test sbagliato per il tipo che hai in mano e puoi buttare via un
pomeriggio, o peggio, cestinare una credenziale che funziona.

## Come applicarlo

### Identifica il tipo di credenziale dal prefisso

| Prefisso | Tipo | Schema di autenticazione |
|--------|------|-------------|
| `cfk_` | Global API Key | header `X-Auth-Email` + `X-Auth-Key` |
| `cfat_` | API Token (creato dall'utente) | `Authorization: Bearer <token>` |
| `cfut_` | User API Token | `Authorization: Bearer <token>` |

Il prefisso è sempre presente nel valore della credenziale. Leggilo prima di decidere lo schema di
autenticazione.

### Valida correttamente ciascun tipo di credenziale

**Global API Key (`cfk_`):**

```bash
# Correct validation — call a real endpoint with the right headers
# Values come from .env, never hardcoded
curl -s -X GET "https://api.cloudflare.com/client/v4/user" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  | jq '.success'
# Expected: true
```

**API Token (`cfat_` / `cfut_`):**

```bash
# Correct validation — use the token verify endpoint
curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.result.status'
# Expected: "active"
```

**Verifica nello specifico la capacità di deploy:**

```bash
# Check that the token can access the Workers scripts endpoint for your account
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.success'
```

### Mappatura delle variabili d'ambiente di wrangler

Wrangler legge le credenziali dall'ambiente, e quale variabile vuole dipende dal tipo di
credenziale:

```bash
# For an API Token (cfat_/cfut_) — Bearer auth
CLOUDFLARE_API_TOKEN=<token>  # wrangler uses this as Bearer

# For a Global API Key (cfk_) — X-Auth-Email + X-Auth-Key
CLOUDFLARE_API_KEY=<key>
CLOUDFLARE_EMAIL=<email>
```

Attenzione a questo: se `CLOUDFLARE_API_TOKEN` è impostata nel `.env`, wrangler la usa come token
Bearer e **ignora** `CLOUDFLARE_API_KEY` e `CLOUDFLARE_EMAIL`. Una `CLOUDFLARE_API_TOKEN` vagante
rimasta da un progetto precedente farà sì che wrangler tenti l'auth Bearer con un valore da Global
Key, e ti ritrovi un errore di autenticazione opaco che non punta a niente.

Controlla nel `.env` se ci sono variabili in conflitto prima di metterti a fare debug di altro:

```bash
# In the project root — look for both variable families
grep -E "CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL" .env
```

Se compaiono entrambe, rimuovi o annulla quella che non corrisponde al tipo di credenziale che
stai effettivamente usando.

### Crea un token con scope limitato a partire dalla Global Key

La Global API Key concede l'accesso completo all'account e non può essere ristretta. Usala una
volta sola per creare un token ristretto, poi usa quel token ristretto per il lavoro di tutti i
giorni:

```bash
# Use the Global Key to create a scoped Workers/Pages deploy token
curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workers-deploy-ci",
    "policies": [
      {
        "effect": "allow",
        "resources": {
          "com.cloudflare.api.account.*": "*"
        },
        "permission_groups": [
          { "id": "<account-id>", "name": "Workers Scripts Write" },
          { "id": "<user-id>", "name": "Workers Routes Write" }
        ]
      }
    ]
  }' | jq '.result.value'
```

Salva il token `cfat_` risultante nel `.env` come `CLOUDFLARE_API_TOKEN`, poi togli
`CLOUDFLARE_API_KEY` e `CLOUDFLARE_EMAIL` dallo stesso file così non possono entrare in conflitto.

### Interpreta correttamente i codici di errore

| Codice | Significato | Causa |
|------|---------|-------|
| 1000 | API Token non valido | Il valore del token è sbagliato o revocato |
| 10000 | Errore di autenticazione | Schema di auth sbagliato (es. Bearer su una Global Key) |
| 9103 | X-Auth-Key o X-Auth-Email sconosciuto | Il valore della chiave o dell'email è errato, non solo lo scope |

L'errore 10000 su una credenziale `cfk_` quasi sempre significa che qualcuno ha mandato Bearer
invece di `X-Auth-Email` + `X-Auth-Key`. L'errore 9103 è diverso: è il valore stesso a essere
sbagliato, quindi non andare a caccia dello scope quando lo vedi.

## Anti-pattern

### Lanciare wrangler whoami per validare un token di deploy

```bash
# Bad — whoami calls /accounts and /user; a narrow deploy token fails both
wrangler whoami

# Good — test the actual capability you care about
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Sintomo: `wrangler whoami` stampa `✘ You are not authenticated` anche se lo stesso token fa il
deploy senza problemi in CI. Il token sta facendo esattamente ciò che il suo scope consente,
quindi lascialo stare.

### Mandare una Global API Key come Bearer

```bash
# Bad — cfk_ credentials require X-Auth-Email + X-Auth-Key, not Authorization: Bearer
curl -H "Authorization: Bearer $CLOUDFLARE_API_KEY" \
  "https://api.cloudflare.com/client/v4/user"
# Returns: {"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}

# Good
curl -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  "https://api.cloudflare.com/client/v4/user"
```

### Usare la Global Key in CI

La Global Key ha accesso completo all'account senza restrizioni di scope, quindi se trapela da una
variabile d'ambiente in CI, chiunque la prenda diventa padrone del tuo account Cloudflare per
intero. Usa invece un token `cfat_` con scope ben ristretto in CI. Tieni la Global Key per i lavori
locali una tantum, come creare nuovi token.

## Vedi anche

- `tooling-runtime/bun-by-default` — usare `bunx wrangler` invece di `npx wrangler`.
- `build-ci-deploy/build-time-env-is-baked` — quando le variabili d'ambiente Cloudflare vengono
  incorporate nella build rispetto a quando vengono lette a runtime.
- Documentazione sui Cloudflare API Token: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Autenticazione delle Cloudflare API: https://developers.cloudflare.com/fundamentals/api/reference/auth/
