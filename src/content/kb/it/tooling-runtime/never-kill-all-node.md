---
title: 'Mai uccidere tutti i processi node — solo quello sulla porta giusta'
category: tooling-runtime
summary: 'Ferma solo il processo legato alla porta o al PID di destinazione; mai taskkill/killall/pkill su tutti i processi node.'
principle: 'Ferma solo il processo legato alla porta/PID di destinazione; mai taskkill/killall/pkill su tutti i processi node. Chiudi il dev server vecchio prima di Playwright quando reuseExistingServer è attivo.'
severity: non-negotiable
tags: [node, process-management, playwright, dev-server, e2e]
sources:
  - project: 'uno standard ingegneristico + una SPA di amministrazione contenuti'
    date: 2026-03-14
    note: 'uccidere solo il processo sulla porta di destinazione; reuseExistingServer riusa un ambiente vecchio'
related:
  - testing/event-driven-no-timeouts
order: 2
updated: 2026-06-10
---

## Perché conta

Il 2026-03-14, durante il lavoro E2E su una SPA di amministrazione contenuti, un server
`dev:token` era già in esecuzione sulla porta di destinazione di Playwright quando è
partita la suite di test. Dato che `playwright.config.ts` aveva `reuseExistingServer: true`,
Playwright ha agganciato quel processo invece di avviarne uno nuovo. Il server vecchio non
aveva `MOCK_OAUTH=true` nel suo ambiente, quindi ogni test che dipendeva
dall'autenticazione è andato in timeout. Undici suite Chromium sono cadute tutte insieme.

La correzione che viene voglia di applicare è "uccidi tutti i processi node e riparti
pulito", ed è sbagliata per qualche motivo:

- Altri sviluppatori o strumenti in background (language server, build watcher,
  microservizi locali) possono avere processi node che non c'entrano nulla con il test
  fallito.
- Su una macchina condivisa, o in CI con job paralleli, uccidere ogni processo node fa
  fuori job che non c'entrano.
- La causa radice è un server vecchio su una porta precisa, non node in generale.

Il `.vscode/settings.json` di questo blog contiene un hook `PreToolUse` che **NEGA**
qualsiasi comando bash che uccide tutti i processi node. Provaci e sbatti contro uno stop
netto.

Quindi identifica i processi per porta o per PID, mai per nome del binario.

## Come applicarlo

### Uccidere solo il processo sulla porta di destinazione (Unix/macOS)

```bash
# Find and kill whatever is on port 4173
lsof -ti :4173 | xargs kill -9
```

### Uccidere solo il processo sulla porta di destinazione (Windows PowerShell)

```powershell
# Find the PID bound to port 4173
$pid = (Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Oppure con `netstat`:

```powershell
netstat -ano | findstr :4173
# Read the PID from the last column, then:
taskkill /PID <pid> /F
```

### La sequenza corretta di teardown prima di Playwright

Quando `reuseExistingServer: true` è impostato (cosa comune, per evitare di buildare due
volte), la correttezza dell'ambiente è in capo a chi chiama. Ferma il processo sulla porta
di destinazione prima di avviare la suite:

```bash
# Step 1 — kill whatever is on the Playwright port
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

# Step 2 — start a fresh server with the correct env
MOCK_OAUTH=true bun run preview &

# Step 3 — run the suite
bun run playwright test
```

In `package.json`, codificalo come script composito così non si può saltare:

```json
{
  "scripts": {
    "test:e2e": "kill-port 5173 && MOCK_OAUTH=true bun run preview & bun run playwright test"
  }
}
```

Il pacchetto `kill-port` è un wrapper cross-platform pensato esattamente per questo
schema, e lascia in pace ogni processo che non sta sulla porta indicata.

### Configurare Playwright per evitare la trappola

Se il progetto può permettersi di ribuildare, imposta `reuseExistingServer` a `false` in CI
e tienilo `true` solo per comodità dello sviluppatore in locale. Metti per iscritto che gli
sviluppatori devono assicurarsi che il server in esecuzione porti l'ambiente corretto:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  webServer: {
    command: 'MOCK_OAUTH=true bun run preview',
    port: 5173,
    reuseExistingServer: !isCI, // never reuse in CI; safe to reuse locally if env is correct
    timeout: 30_000,
  },
});
```

### Identificare un processo prima di ucciderlo

Prima di mandare un qualsiasi segnale di kill, verifica cosa sta girando:

```bash
# Unix — show the command, not just the PID
lsof -i :5173

# Windows
netstat -ano | findstr :5173
# then:
tasklist /FI "PID eq <pid>"
```

Quel controllo prende cinque secondi e ti salva dall'uccidere per sbaglio un processo che
non c'entra.

## Anti-pattern

### Uccidere tutti i processi node

```bash
# Bad — indiscriminate; ends unrelated servers, language service processes, build tools
pkill -f node
killall node
taskkill /IM node.exe /F

# Good — targeted
lsof -ti :5173 | xargs kill -9
```

Cosa produce l'approccio sbagliato: muoiono altri watcher, gli editor perdono il loro
language server TypeScript, e job in background che non c'entrano falliscono in silenzio.

### Avviare Playwright senza prima liberare la porta

```bash
# Bad — Playwright reuses the stale dev:token server because the port is already in use
bun run playwright test

# Good — port is clear before Playwright launches its webServer
lsof -ti :5173 | xargs kill -9 2>/dev/null; bun run playwright test
```

Il sintomo: i test che dipendono da una variabile d'ambiente precisa (diciamo
`MOCK_OAUTH`) falliscono con timeout di autenticazione anche se l'ambiente è impostato nella
config di Playwright, perché `reuseExistingServer: true` salta del tutto il `command`.

### Usare `--force` su un PID che non esiste più

```bash
# Defensive pattern — suppress the "no such process" error rather than checking first
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
```

Senza il `|| true`, uno step di teardown in CI fallisce quando la porta è già libera, e ti
ritrovi con un falso fallimento della pipeline.

## Enforcement

L'hook `PreToolUse` nel `.vscode/settings.json` del progetto blocca le chiamate ai tool la
cui stringa di comando corrisponde a pattern tipo `killall node`, `pkill node`, o
`taskkill /IM node.exe`. Quando l'hook scatta, trova quale porta è davvero vecchia e uccidi
solo quella.

In code review, tratta come bloccante qualunque script in `package.json` o file di workflow
CI che contenga `killall`, `pkill -f node`, o `taskkill /IM node.exe`. Il rimpiazzo è
sempre un kill mirato sulla porta.

## Vedi anche

- `testing/event-driven-no-timeouts` — come `reuseExistingServer` interagisce con il
  rilevamento di prontezza del server di Playwright.
- Documentazione di Playwright su webServer: https://playwright.dev/docs/test-webserver
