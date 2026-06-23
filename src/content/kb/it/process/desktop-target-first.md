---
title: 'Se esiste un target desktop, testa prima lì'
category: process
summary: 'Quando il progetto ha un target desktop (Tauri, Electron), compilalo e verificalo a mano tramite il browser MCP prima di lanciare gli E2E automatici.'
principle: 'Quando un progetto ha un target desktop (Tauri, Electron), compila sempre l''app desktop e verifica prima lì tramite il browser MCP; il test su browser/dev server non lo sostituisce; solo dopo che funziona lancia gli E2E automatici.'
severity: strong
tags: [process, desktop, tauri, electron, testing, verification]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'target desktop testato prima tramite browser MCP; poi Playwright'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 3
updated: 2026-06-10
---

Un'app Tauri e una scheda del browser sono runtime diversi. Tauri incorpora una WebView
di sistema, applica la propria CSP ed espone un insieme diverso di API: il bridge `invoke`,
i permessi sul file system, la gestione delle finestre. Carica anche gli asset in modo
diverso rispetto a un dev server. Codice che gira senza problemi in un dev server basato
su Chromium può rompersi nella WebView di Tauri per motivi che non hanno nulla a che fare
con la logica della tua applicazione. Un permesso IPC mancante. Una direttiva CSP che
blocca uno script inline. Un percorso di asset che si risolve in modo diverso una volta
che l'app è impacchettata.

Se testi nel browser o nel dev server e poi dichiari finito il target desktop, non hai
preso una scorciatoia. Hai saltato il test.

## Perché conta

Lo standard ingegneristico (formalizzato il 2026-06-02) è esplicito: se il progetto ha
un target desktop, **compila prima l'app desktop e verifica prima lì**. La regola esiste
perché i casi di fallimento sono reali, e la maggior parte non si riproduce mai in un
browser. Alcuni esempi specifici di Tauri:

- Chiamate `invoke` che restano appese in silenzio perché il comando Rust non è stato
  registrato in `tauri::Builder`.
- Asset che danno 404 perché il percorso del bundle differisce dal percorso virtuale
  del dev server.
- Chiamate IPC bloccate dall'allowlist in `tauri.conf.json`.
- Eventi delle finestre che scattano in modo diverso sotto la WebView di sistema rispetto
  a V8.
- Variabili d'ambiente definite nell'ambiente di sviluppo ma non incorporate nel bundle
  di produzione.

In ognuno di questi casi il test sul browser resta verde mentre l'app desktop è rotta.
Un utente che installa l'app vede il comportamento desktop, mai quello del browser.

La regola di override a livello di workflow lo conferma. Quando viene specificato un
ambiente di test, che sia Tauri, il browser o qualunque altra cosa, quell'istruzione ha
la priorità. Non puoi sostituirla con un'altra.

## Come applicarla

### Compila prima di testare

```bash
# Tauri — full production build
bun tauri build

# Tauri — dev build with hot reload (acceptable for rapid iteration,
# but the final verification must use a real build)
bun tauri dev
```

Non aprire `localhost:5173` in un browser e considerarlo fatto. Il target è
l'applicazione desktop compilata e impacchettata.

### Verifica tramite il browser MCP

Una volta che l'app è in esecuzione, punta il browser MCP all'URL dell'app. Per
`tauri dev` è il localhost della WebView; per una build di produzione, avvia il binario.
Poi pilota la funzionalità a mano:

1. Percorri ogni flusso utente che la modifica tocca.
2. Tieni d'occhio la console della WebView per gli errori.
3. Tieni d'occhio il pannello di rete per richieste fallite o risposte inattese.
4. Cattura screenshot che mostrano la funzionalità che funziona nell'app desktop reale.

Gli screenshot non sono opzionali. Sono la prova che la verifica è davvero avvenuta.
Vedi [niente è fatto senza la prova degli screenshot di produzione](/principles/process/prove-with-production-screenshots).

### Solo allora lancia gli E2E con Playwright

Dopo che la verifica manuale sul desktop produce screenshot puliti, lancia la suite
automatica di Playwright. Playwright copre le regressioni. Non sostituisce un essere
umano che guarda il runtime reale. Lancia l'intera suite, conferma zero flake e includi
i risultati nella PR.

### Console e rete sono controlli obbligatori

Prima di dichiarare completa la verifica desktop:

- Apri i DevTools della WebView (in `tauri dev`, tasto destro → Inspect, oppure abilita
  la finestra dei devtools nella config di Tauri).
- Conferma che la console non abbia errori, né warning che puntino a un problema di
  configurazione, né richieste di rete fallite.
- Conferma che le chiamate IPC si risolvano invece di restare appese.

Un fallimento silenzioso nella console conta comunque come fallimento.

## Anti-pattern

**Far girare il dev server e chiamarlo test desktop.** Il dev server è una comodità per
lo sviluppo. Una suite Playwright che passa contro `localhost:5173` ti dice che il codice
web è corretto e nient'altro. Non dice nulla sul runtime di Tauri.

**Dare per scontata la parità.** "Funzionava in Chrome, Tauri usa una WebView, quindi
funzionerà." La WebView di sistema su Windows (WebView2), macOS (WKWebView) e Linux
(WebKitGTK) si comporta in modo diverso da Chrome e l'una dall'altra. La parità si è
rivelata un'assunzione sbagliata nella pratica.

**Saltare la build per modifiche minori.** Una "piccola modifica CSS" che ha toccato
anche un componente che usa `invoke` non è piccola nel contesto desktop. La regola vale
per ogni modifica che tocca il layer frontend.

**Delegare il controllo desktop alla CI.** La CI può compilare il binario di Tauri ed
eseguire un test headless, ma non può confermare che l'esperienza reale, renderizzata e
rivolta all'utente sia corretta. La verifica basata su screenshot nell'app in esecuzione
è un passaggio umano.

## Applicazione

Il gate della checklist del dev-cycle è semplice: prima di aprire una PR, conferma di
avere uno screenshot dall'app desktop reale che mostra la funzionalità in funzione. Una
descrizione di PR che dice "verificato nel browser" per un progetto Tauri è incompleta.

Quando viene richiesto un ambiente di test specifico, quell'istruzione prevale su
qualunque default. Se l'istruzione è "testa in Tauri" e la risposta torna come "l'ho
lanciato in Playwright" o "ho controllato il dev server", l'istruzione non è stata
seguita.
