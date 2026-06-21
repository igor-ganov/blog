---
title: 'Preferisci server MCP HTTP+OAuth con il flusso di login /mcp'
category: tooling-runtime
summary: 'Scegli server MCP che si autenticano tramite il pulsante di login /mcp (HTTP + OAuth guidato dal client) invece di server stdio che si autenticano tramite un proprio comando CLI.'
principle: 'Scegli server MCP che si autenticano tramite il pulsante di login /mcp (HTTP + OAuth guidato dal client), non server stdio che si autenticano tramite un proprio comando CLI.'
severity: preferred
tags: [mcp, oauth, http, teams, microsoft365, stdio, authentication]
sources:
  - project: 'un''integrazione MCP'
    date: 2026-05-31
    note: 'preferire MCP HTTP+OAuth con pulsante di login /mcp rispetto all''auth CLI via stdio'
related:
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 6
updated: 2026-06-10
---

## Perché conta

Il 2026-05-31, mentre configuravo un'integrazione MCP per Microsoft Teams / M365, ho
confrontato due pacchetti di server MCP:

- `@floriscornel/teams-mcp` — un server stdio che si autentica eseguendo un proprio
  comando CLI di login. Devi autenticarti attraverso il flusso del pacchetto, fuori dal
  client MCP.
- `@softeria/ms-365-mcp-server` — un server HTTP che espone un endpoint `/mcp` con un
  pulsante di login. L'autenticazione avviene dentro il flusso OAuth del client MCP.

Ho scartato il primo. Il problema è strutturale. Un server MCP stdio che gestisce in
proprio l'autenticazione non ha modo di mostrare un pulsante di login dentro il client
MCP, quindi l'assistente non può completare il flusso di auth al posto tuo. Esegui un
comando CLI separato, lo stato dell'auth vive fuori dalla sessione MCP, e ogni refresh
del token o ri-autenticazione ti trascina di nuovo fuori dal client MCP per rifarla.

Il secondo pacchetto funziona perché l'autenticazione è guidata dal client. Il client MCP
apre l'endpoint `/mcp`, il server presenta un pulsante di login, ci clicchi e completi il
flusso di consenso OAuth nel browser, e il token di sessione viene salvato. Tutto questo
resta dentro l'interfaccia del client MCP.

Questo si generalizza a qualunque server MCP che valuti: preferisci quello che si autentica
tramite `/mcp` (HTTP + OAuth) rispetto a quello che si autentica tramite un comando CLI.

## Come applicarlo

### Configurare un server MCP HTTP+OAuth (esempio con Teams)

Installa ed esegui il server in locale:

```bash
# Run the HTTP MCP server on port 8765 with org-mode and auth tools enabled
bunx @softeria/ms-365-mcp-server --http 8765 --org-mode --enable-auth-tools
```

Registralo nel client MCP come server con scope utente che punta all'endpoint HTTP:

```json
{
  "mcpServers": {
    "teams": {
      "url": "http://localhost:8765/mcp"
    }
  }
}
```

Alla prima connessione, il client interroga `/mcp` e il server restituisce un pulsante di
login. Completi OAuth nel browser, e la sessione viene salvata e sopravvive ai riavvii del
client MCP.

### Avviare automaticamente il server HTTP locale su Windows senza admin

Un'attività pianificata richiede l'Amministratore. Per evitarlo, metti un elemento di avvio
nella cartella Esecuzione automatica dell'utente usando un wrapper VBS che lancia il
processo nascosto, senza finestra della console:

```vbscript
' start-ms365-mcp.vbs — place in shell:startup
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c bunx @softeria/ms-365-mcp-server --http 8765 --org-mode --enable-auth-tools", 0, False
```

Posiziona il file `.vbs` in:
`C:\Users\<your-username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

Ora il server parte al login, nascosto, senza coinvolgere i diritti di Amministratore.

### Valutare il tipo di autenticazione di un nuovo pacchetto di server MCP

Prima di adottare un server MCP, rispondi a queste domande:

1. Si avvia come server HTTP con un endpoint `/mcp`? Se sì, supporta il flusso con
   pulsante di login.
2. Si autentica tramite un comando CLI (`mcp-server login`, `mcp auth`, ecc.)? Se sì,
   il flusso di auth sta fuori dal client MCP, quindi preferisci un'alternativa.
3. Se esiste solo un pacchetto stdio, c'è un wrapper o proxy HTTP locale che espone
   `/mcp`? Alcuni pacchetti supportano entrambe le modalità tramite un flag `--http`.

```bash
# Check if a package supports HTTP mode
bunx <package-name> --help | grep -E "\-\-http|\-\-port|http"
```

### I blocchi sul consenso del tenant non sono un problema del pacchetto

Durante la stessa sessione, passare da `@floriscornel/teams-mcp` a
`@softeria/ms-365-mcp-server` non ha cambiato nulla rispetto alla schermata "Need admin
approval" durante il consenso OAuth. Quella schermata è una questione di policy del tenant:
il tenant di destinazione ha il consenso self-service alle app disabilitato, quindi un
amministratore di Azure AD deve concedere il consenso per l'applicazione.

Non ha nulla a che fare con quale pacchetto scegli. Abbiamo scelto quello giusto e il blocco
era comunque esterno. Non tornare al pacchetto stdio sperando che aggiri la policy del
tenant, perché non può.

## Anti-pattern

### Scegliere un server stdio perché è il primo risultato di ricerca

```bash
# Bad — installs a stdio server with CLI-driven auth
bun add -g @floriscornel/teams-mcp
teams-mcp login  # auth outside MCP client; fragile
```

Il sintomo: il client MCP mostra il server come connesso, ma le chiamate agli strumenti
falliscono con "not authenticated" perché il token di sessione del login CLI non viene mai
inoltrato nel contesto della sessione MCP.

### Dare per scontato che un server HTTP su una porta significhi supporto di /mcp

Alcuni server HTTP servono una semplice API REST e si limitano ad ascoltare su una porta
senza implementare affatto il transport HTTP di MCP. Verifica interrogando `/mcp`
direttamente:

```bash
curl -i http://localhost:8765/mcp
# A valid MCP HTTP server returns 200 or a redirect with MCP protocol headers
# A non-MCP HTTP server returns 404 or an unrelated response
```

### Non persistere lo stato dell'auth tra i riavvii del client MCP

I server MCP HTTP+OAuth salvano il token di sessione in memoria o su disco, a seconda
dell'implementazione. Se il server lo tiene solo in memoria e riparte a ogni avvio, ti
ri-autentichi a ogni sessione. Preferisci implementazioni che persistono il token in un file
locale o nel keychain di sistema, oppure che usano refresh token a lunga durata.

```bash
# Check if the server process has persistent token storage
# Look for a --token-store, --persist, or --data-dir flag
bunx @softeria/ms-365-mcp-server --help | grep -E "token|persist|store|data"
```

## Applicazione

Questo è un criterio di valutazione per la scelta di un server MCP, non una regola di lint
automatica. Quando qualcuno propone una nuova integrazione MCP, fagli documentare quale
flusso di autenticazione usa il pacchetto prima che venga adottato. Se il pacchetto è solo
stdio con auth via CLI e senza modalità HTTP, metti per iscritto la decisione e il
compromesso che stai accettando prima del merge.

## Vedi anche

- `tooling-runtime/drive-the-real-browser-over-mcp` — usare l'MCP chrome-devtools per
  guidare una sessione di browser reale e autenticata, un approccio complementare ai server
  MCP HTTP+OAuth.
- Specifica del Model Context Protocol: https://modelcontextprotocol.io/docs/concepts/transports
- `@softeria/ms-365-mcp-server`: https://github.com/softeria/ms-365-mcp-server
