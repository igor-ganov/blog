---
title: 'Verifica sul browser reale tramite MCP'
category: tooling-runtime
summary: 'Pilota il browser con il MCP chrome-devtools sulla porta 9222 usando un profilo Chrome di debug dedicato per ispezionare e correggere app già pubblicate contro sessioni reali.'
principle: 'Per ispezionare/correggere un''app pubblicata contro la sessione reale, pilota il browser con il MCP chrome-devtools sulla porta 9222 usando un profilo Chrome di debug dedicato; non fare scritture distruttive su una board reale senza chiedere prima.'
severity: preferred
tags: [mcp, chrome-devtools, remote-debugging, browser-automation]
sources:
  - project: 'un client per Jira'
    date: 2026-06-09
    note: 'MCP chrome-devtools sulla 9222; profilo Chrome di debug dedicato; Vivaldi non funziona; chiedi prima di scrivere'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/prefer-http-oauth-mcp-flow
order: 3
updated: 2026-06-10
---

## Perché conta

Il 2026-06-09, lavorando a un client per Jira, dovevo ispezionare una board Jira già
pubblicata che aveva dietro una sessione autenticata attiva, non una build di sviluppo
locale. Playwright puntato su un ambiente di test non avrebbe mai visto i dati reali.
L'unico modo per guardare lo stato effettivo era pilotare il browser in cui l'utente era
già loggato.

Il server MCP chrome-devtools colma quella distanza. Si aggancia all'endpoint di debug
remoto di Chrome sulla porta 9222 ed espone all'assistente `list_pages`, `navigate`,
`screenshot`, `evaluate` e `querySelector`.

Durante quella sessione mi hanno morso due vincoli, e nessuno dei due è ovvio dalla
documentazione.

1. **Vivaldi non funziona.** Espone una pila di target `worker` e `service_worker`
   accanto ai target delle schede visibili. Quando il server MCP chiama `Network.enable`
   su uno di quei target di background, il Chrome DevTools Protocol resta lì ad aspettare
   una risposta che non arriva mai, e la sessione va in timeout. Usa Google Chrome. Brave
   e qualsiasi altro fork di Chromium che inietta i propri service worker falliranno allo
   stesso modo.

2. **Chrome 136+ blocca il debug remoto sul profilo predefinito.** A partire da Chrome
   136, Google ha disabilitato `--remote-debugging-port` sul profilo predefinito
   dell'utente per ragioni di sicurezza, quindi devi passare un `--user-data-dir`
   separato. La cartella del profilo resta su disco, ed è esattamente quello che vuoi qui:
   l'utente fa il login una volta e le sessioni successive trovano i cookie già pronti.

## Come applicarlo

### Avvia Chrome con un profilo di debug dedicato

```bash
# Windows — open a new terminal and run:
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="C:\Users\igor_\ChromeDebugProfile" \
  --no-first-run \
  --no-default-browser-check
```

Su macOS:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$HOME/.chrome-debug-profile"
```

Verifica che l'endpoint sia attivo:

```bash
curl http://127.0.0.1:9222/json/version
```

Una risposta JSON che contiene `"Browser": "Chrome/..."` significa che la connessione è
viva.

### Libera la porta 9222 prima di avviare

Se un'istanza precedente di Chrome sta tenendo occupata la porta:

```bash
# Unix
lsof -ti :9222 | xargs kill -9 2>/dev/null || true

# Windows PowerShell
$pid = (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Poi riavvia Chrome come sopra.

### Connettiti ed elenca le pagine aperte

Una volta che Chrome è in piedi, i tool MCP funzionano. `list_pages` restituisce i target
aperti. Può tornare come array vuoto se nessuna scheda è ancora stata toccata. Quando
succede, chiama `new_page` con l'URL di destinazione, che seleziona una scheda esistente o
ne apre una nuova.

```
list_pages        → []              # nothing selected yet
new_page url="https://app.example.com/board"
list_pages        → [{ id: "...", url: "https://app.example.com/board", ... }]
```

### Ispeziona lo shadow DOM

La maggior parte dei web component nasconde le proprie parti interne nello shadow DOM, e
un semplice `querySelector` non ci arriva dentro. Usa `evaluate` e percorri lo shadow root
a mano:

```typescript
// MCP evaluate call — pierce one level of shadow DOM
document
  .querySelector('jira-board')
  ?.shadowRoot?.querySelector('.issue-card[data-issue-id="PROJ-123"]');
```

Per annidamenti più profondi, ripeti il salto attraverso ogni shadow root.

### Scattare uno screenshot come prova

```
screenshot        → base64 PNG of the current viewport
```

Secondo la regola `process/prove-with-production-screenshots`, fai uno screenshot dello
stato reale prima e dopo una correzione, così hai la prova che la modifica ha funzionato
contro l'ambiente live.

### Primo login dell'utente

La prima volta che punti Chrome a un nuovo `--user-data-dir`, si apre un profilo pulito
senza cookie. Vai sull'app e fai il login a mano. Chrome memorizza la sessione nella
cartella del profilo e sopravvive ai riavvii, quindi l'utente non rifarà il login su
quella macchina a meno che la sessione non scada o qualcuno cancelli la cartella del
profilo.

## Anti-pattern

### Usare Vivaldi (o altri fork di Chromium) come target di debug

```
# Bad — Vivaldi exposes service_worker targets that hang CDP sessions
"C:\...\Vivaldi\Application\vivaldi.exe" --remote-debugging-port=9222 ...
```

Sintomo: `Network.enable timed out` dopo qualche secondo. La sessione MCP sembra connessa,
dato che la porta 9222 risponde a `/json`, ma ogni chiamata di tool che ha bisogno di dati
di rete si blocca e alla fine lancia un timeout.

Soluzione: usa Google Chrome come target di debug.

### Usare il profilo Chrome predefinito con Chrome 136+

```bash
# Bad — Chrome 136 silently ignores --remote-debugging-port on the default profile
chrome.exe --remote-debugging-port=9222
# Result: curl http://127.0.0.1:9222/json/version → Connection refused
```

Soluzione: passa `--user-data-dir` puntato a una cartella non predefinita.

### Eseguire scritture distruttive sulla board reale senza chiedere

I tool MCP possono cliccare pulsanti, compilare form e spingere cambi di stato sulla board
live. La sessione è reale, non un ambiente di test, quindi qualsiasi scrittura — cambiare
lo stato di un'issue, trascinare card, aggiornare un campo — colpisce i dati di produzione
all'istante.

Regola: prima di ogni scrittura (navigare a un form, cliccare una transizione di stato,
innescare un drag-and-drop), conferma prima con l'utente. Le operazioni di sola lettura
come screenshot, evaluate e querySelector si possono eseguire in autonomia.

```
# Bad — assistant changes issue status without asking
click selector=".transition-button[data-status='Done']"

# Good — assistant asks first
"I can click the 'Done' transition button on PROJ-123. This will change the issue
status in Jira. Proceed?"
```

## Come imporlo

Un linter non può controllarlo; è una preferenza di workflow. Imponilo attraverso la
regola del ciclo di sviluppo: ogni volta che un compito comporta ispezionare o modificare
un'app pubblicata con dati reali, ricorri prima al workflow MCP chrome-devtools. Playwright
contro un ambiente di test va bene solo quando non ti serve davvero una sessione reale.

## Vedi anche

- `process/prove-with-production-screenshots` — screenshot dalla sessione reale come prova
  del comportamento corretto.
- `tooling-runtime/prefer-http-oauth-mcp-flow` — usare server MCP con HTTP+OAuth per
  autenticarsi senza un passaggio di login da CLI.
- Documentazione del Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Debug remoto su Android/desktop: https://developer.chrome.com/docs/devtools/remote-debugging/
