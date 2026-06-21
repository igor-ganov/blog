---
title: 'I worker paralleli sono un rilevatore di race, non solo una leva di velocità'
category: testing
summary: 'Eseguire la suite E2E in serie nella CI nasconde le race dell''applicazione dietro una lentezza casuale. Alzare i worker è insieme il maggiore acceleratore della pipeline e uno stress test che fa emergere bug reali: correggi quelli, mai il parallelismo.'
principle: 'Esegui gli E2E con worker paralleli nella CI. Quando il parallelismo fa fallire i test, l''applicazione ha una race: correggi l''app o il segnale di attesa, mai ridurre i worker o gonfiare i timeout. Regola il tetto di attesa una volta sola, tramite ambiente, non per singolo spec.'
severity: strong
tags: [testing, playwright, e2e, ci, determinism, performance]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-06-12
    note: 'i worker 1→4 nella CI hanno ridotto gli e2e da 6m55s a 2m46s e hanno fatto emergere subito tre race reali del service worker che le esecuzioni in serie avevano mascherato per mesi. Tetto di attesa alzato con una sola manopola d''ambiente (30s CI, 10s locale), non con patch per singolo spec. Una fixture con un percorso macchina assoluto aveva saltato in silenzio un test nella CI per mesi.'
related:
  - testing/event-driven-no-timeouts
  - testing/no-retries-no-flakes
  - testing/wait-for-service-worker-settle
  - testing/out-of-band-transport-needs-dom-signals
order: 7
updated: 2026-06-12
---

Una suite E2E seriale è lenta, e quella lentezza sta facendo un lavoro che non vuoi
che faccia. Ogni test ha l'intera macchina a disposizione, le pagine si assestano con
comodo e le race si nascondono nel margine. Alza i worker e la suite diventa molto più
veloce, mentre ogni test che passava per caso comincia a fallire onestamente. Vuoi
entrambe le cose.

La regola: la CI esegue la suite con worker paralleli, e qualunque fallimento
provocato dal parallelismo è un difetto reale dell'applicazione o del segnale di
attesa. Ridurre i worker per "stabilizzare" la suite è la stessa bugia di aggiungere
retry. Compri il verde togliendo lo stress che espone la race.

## Perché conta

Sulla SPA di amministrazione contenuti (2026-06-12) la pipeline di deploy eseguiva gli
E2E con `workers: 1` nella CI. Portarlo a 4 ha ridotto lo step E2E da 6m55s a 2m46s, il
singolo risparmio più grande in una pipeline da 9,5 minuti. Ha anche rotto tre test
nelle prime esecuzioni. Nessuno dei tre era un problema di test:

1. Una navigazione post-login moriva a intermittenza con `net::ERR_ABORTED`: l'attivazione
   di un service worker fresco reclama il client a metà del `goto`. Vecchio di mesi; le
   esecuzioni seriali erano abbastanza lente da far vincere sempre l'attivazione nella race.
2. Un cambio di sezione faceva un'asserzione sugli elementi della lista prima che i dati
   della sezione fossero arrivati: i dati viaggiano su un `MessageChannel`, invisibile alle
   attese basate sulla rete. Vedi
   [il trasporto fuori banda richiede segnali DOM](/kb/testing/out-of-band-transport-needs-dom-signals).
3. Le visite si ancoravano a `networkidle`, che è uno sleep nascosto da 500ms e non prova
   nulla sul ciclo di vita del SW. Vedi
   [attendere che il service worker si assesti](/kb/testing/wait-for-service-worker-settle).

Ogni correzione aveva forma di evento e ha reso più onesto il comportamento
dell'applicazione. Dopo di che la suite è passata 271/271 tre volte di fila in locale ed è
rimasta verde nella CI, più veloce di prima e degna di fiducia.

## Come applicarlo

**Passo 1: paralleli nella CI, in modo esplicito.**

```ts
// playwright.config.ts
export default defineConfig({
  // CI runners have ~4 vCPUs; saturate them. Locally let Playwright decide.
  workers: process.env.CI ? 4 : undefined,
});
```

**Passo 2: una sola manopola d'ambiente per il tetto di attesa, mai imbottitura per singolo spec.**

Quattro worker su quattro vCPU condivise rendono un avvio a freddo sano legittimamente più
lento che su una macchina locale dedicata. Questo cambia il *tetto* per cui un'attesa può
bloccarsi prima di fallire, non l'attesa stessa. Rendi il tetto un override d'ambiente negli
helper di attesa condivisi e mantieni il default stretto in locale:

```ts
// wait helper (shared toolkit)
const envMax = Number(process.env.E2E_MAX_WAIT_MS);
const maxMs = Number.isFinite(envMax) && envMax > 0 ? envMax : 10_000;
```

```yaml
# deploy.yml — CI is slower, not buggier; say it once.
env:
  E2E_MAX_WAIT_MS: '30000'
```

Le attese restano guidate dagli eventi e si risolvono nell'istante in cui la condizione è
vera; si sposta solo la scadenza di fallimento. Quando test della coda random iniziano ad
andare in timeout nella CI, alza questa singola manopola. Non spargere `{ timeout: 30000 }`
sui singoli spec, perché ognuna di queste nasconde se lo spec è lento o rotto.

**Passo 3: verifica cosa la suite seriale non stava eseguendo in silenzio.**

Il lavoro sulla velocità ti costringe a leggere la suite, e ciò che ci trovi può contare
quanto i tempi. Un test che caricava un PDF puntava la sua fixture a un **percorso assoluto
sulla macchina dell'autore**, protetto da `test.skip` quando il file manca. Aveva saltato in
silenzio nella CI per mesi mentre la suite riportava verde. Le fixture stanno nel repository
(`e2e/fixtures/`), e uno skip condizionale su una fixture mancante è un
[test saltato, che è un test fallito](/kb/testing/no-retries-no-flakes).

## Anti-pattern

```ts
// ❌ Stabilising by de-parallelising. The race is still in production.
workers: 1,

// ❌ fullyParallel: false / serial mode for a flaky describe block —
//    same move, smaller blast radius, same hidden race.
test.describe.configure({ mode: 'serial' });

// ❌ Per-spec timeout padding. Now nobody knows the real budget.
await expect(item).toBeVisible({ timeout: 45_000 });

// ❌ Fixture outside the repo, guarded by a skip — green CI, zero coverage.
const PDF = 'C:/Users/author/Downloads/sample.pdf';
test.skip(!fs.existsSync(PDF), 'fixture missing');
```

## Applicazione

La pipeline stessa fa rispettare gran parte di questo: worker paralleli configurati nella CI,
zero retry e la regola delle tre esecuzioni. Il resto va nella review. Controlla che `workers`
non sia 1 nella CI, che nessun `mode: 'serial'` compaia senza una giustificazione scritta, che
nessun override di timeout letterale viva negli spec (il tetto sta nell'helper condiviso) e che
ogni percorso di fixture si risolva dentro il repository.
