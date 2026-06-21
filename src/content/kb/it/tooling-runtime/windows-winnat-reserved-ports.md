---
title: "winnat di Windows riserva le porte — non è un processo rimasto appeso"
category: tooling-runtime
summary: 'Un errore EACCES sul bind in Windows spesso è un intervallo di porte riservato da winnat, non un processo rimasto attivo; controlla gli intervalli esclusi ed esegui su una porta sicuramente libera tramite una config usa e getta.'
principle: 'Un errore EACCES sul bind in Windows spesso è un intervallo di porte riservato da winnat, non un processo rimasto attivo; controlla gli intervalli esclusi ed esegui su una porta sicuramente libera tramite una config usa e getta.'
severity: context
tags: [windows, winnat, port, eacces, playwright, e2e, preview]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-05-23
    note: 'EACCES dovuto a un intervallo riservato da winnat, non a un processo rimasto attivo; controlla excludedportrange; esegui su 4173 tramite config temporanea'
related:
  - tooling-runtime/never-kill-all-node
  - testing/event-driven-no-timeouts
order: 5
updated: 2026-06-10
---

## Perché è importante

Il 2026-05-23 la suite E2E di preview della SPA content-admin (`preview:test`) è fallita con:

```
Error: listen EACCES: access denied ::1:5173
```

La diagnosi ovvia è che un processo rimasto appeso stia tenendo occupata la porta. Qui era sbagliata.
`kill-port 5173` è andato a buon fine (exit 0, nessun errore), e il bind continuava a fallire con lo stesso
`EACCES`. Nessun processo teneva occupata la 5173. Era Windows a bloccarla a livello di sistema operativo.

La causa è il **NAT di Windows (winnat)**. A partire da Windows 10, la Windows
Hypervisor Platform e i servizi correlati (Hyper-V, WSL2, Docker Desktop) istruiscono winnat
a riservare per uso interno degli intervalli di porte dinamiche, e quegli intervalli cambiano a ogni riavvio.
Quando la tua porta di destinazione finisce dentro un intervallo riservato, il sistema operativo rifiuta il bind che
ci sia o meno un processo a usarla. L'errore che ottieni è `EACCES`, identico a un banale
errore di permessi, ed è proprio questo a mandare l'indagine sulla strada sbagliata.

Sulla macchina dove è successo, all'epoca l'intervallo riservato comprendeva
`5120–5219`, che copre la 5173. La porta 4173 (il default di Vite preview) stava fuori da tutti
gli intervalli riservati e si è collegata senza problemi.

## Come applicarlo

### Diagnosi: controlla gli intervalli di porte esclusi

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Output di esempio:

```
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
      5120        5219
      7000        7059
     49696       49795
     50000       50059

3 block(s) excluded.
```

Se la tua porta di destinazione (per es. 5173) cade dentro uno di questi intervalli, è quella la causa.
Nessun kill di processo aiuterà. Passa alla scelta di una porta libera.

### Soluzione senza Amministratore: usa una porta sicuramente libera tramite una config usa e getta

La soluzione più rapida che non richiede privilegi elevati: copia la config in un file temporaneo
con una porta diversa ed esegui la suite contro quel file. **Non** committare il file
temporaneo.

Per un progetto Playwright + Vite:

```typescript
// playwright.config.local.ts — TEMP FILE, DO NOT COMMIT
// Copy of playwright.config.ts with port changed to 4173
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  webServer: {
    ...base.webServer,
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  use: {
    ...base.use,
    baseURL: 'http://localhost:4173',
  },
});
```

Se il progetto usa `vite preview` come comando del webServer, passa la porta in modo esplicito:

```typescript
webServer: {
  command: 'bun x vite preview --port 4173',
  url: 'http://localhost:4173',
  reuseExistingServer: false,
},
```

Riusa la `dist/` già compilata — niente ricompilazione:

```bash
# Run against the temp config; dist/ already exists from the previous build step
bun run playwright test --config=playwright.config.local.ts
```

Cancella la config temporanea dopo la sessione:

```bash
rm playwright.config.local.ts
```

### Soluzione con Amministratore: rimescola gli intervalli riservati

Con accesso da Amministratore puoi azzerare temporaneamente gli intervalli riservati:

```powershell
# Requires Administrator — restarts the winnat service, reshuffles dynamic ranges
net stop winnat
net start winnat
```

Riesegui `netsh interface ipv4 show excludedportrange protocol=tcp` per vedere i nuovi
intervalli. Consideralo temporaneo, dato che gli intervalli cambiano di nuovo al prossimo riavvio o
riavvio del servizio.

### Scegliere una porta affidabilmente libera

Sulla macchina dove è emerso il problema, la porta `4173` resta fuori dagli intervalli riservati
da winnat. Altre scelte che hanno retto nel tempo:

- `4173` — default alternativo di Vite preview, costantemente libera.
- `4000` — sotto la tipica finestra di prenotazione dinamica.
- `3000`, `3001` — classici default di Node/Express, di solito non riservati.

Stai alla larga dalle fasce `5120–5220` e `7000–7060`, che Hyper-V e WSL2 si prendono spesso.

## Anti-pattern

### Uccidere processi per risolvere un EACCES che non dipende dai processi

```bash
# Bad — kill-port succeeds but the bind still fails; time wasted
kill-port 5173
bun run preview  # still EACCES

# Good — check reserved ranges first
netsh interface ipv4 show excludedportrange protocol=tcp
# then switch to a free port
```

Sintomo: `kill-port` riporta successo (o riporta nessun processo trovato), e il server continua
a rifiutare il bind. Quando lo vedi, il blocco è winnat, non un processo.

### Committare la config usa e getta

```bash
# Bad — the temp config pollutes the repo and may confuse CI
git add playwright.config.local.ts
git commit -m "fix: use port 4173 for tests"

# Good — use it locally, delete it, fix the canonical config if needed
rm playwright.config.local.ts
# If the project permanently needs a different port, update playwright.config.ts directly
```

La config usa e getta è uno strumento diagnostico locale, non una soluzione definitiva. Se la 5173 è inutilizzabile su
ogni macchina di sviluppo, cambia la porta canonica in `playwright.config.ts` e
`vite.config.ts`.

### Usare net stop winnat senza Amministratore

```
# Bad — will fail silently or with an access denied error on a non-elevated terminal
net stop winnat
```

Il comando richiede un terminale con privilegi di Amministratore. Se fallisce, l'intervallo di porte resta
com'era e il bind successivo fallisce di nuovo. Verifica l'elevazione prima di contare su questo.

## Applicazione automatica

Qui non è possibile alcuna applicazione automatica, dato che il problema vive a livello di sistema operativo. La
guardia di processo pratica è:

1. Prima di aprire un bug "port already in use", esegui
   `netsh interface ipv4 show excludedportrange protocol=tcp` e controlla se la porta di destinazione
   è in un intervallo riservato.
2. Tieni una nota a livello di progetto (in `CONTRIBUTING.md` o `.vscode/README`) che documenti
   quali porte sono sicure da usare sulle macchine di sviluppo Windows.

## Vedi anche

- `tooling-runtime/never-kill-all-node` — distinguere tra un processo rimasto appeso e
  una prenotazione di porta a livello di sistema operativo.
- `testing/event-driven-no-timeouts` — la prontezza del webServer di Playwright e come
  i fallimenti di porta si manifestano nell'output dei test.
- Documentazione Microsoft sulle prenotazioni di porte di Hyper-V:
  https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements
```