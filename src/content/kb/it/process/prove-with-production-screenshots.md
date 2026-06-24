---
title: "Niente è \"finito\" senza prove con screenshot dalla produzione"
category: process
summary: 'Non dichiarare mai che funziona senza prove con screenshot dall''ambiente di produzione e da un viewport mobile reale; mostra gli screenshot, non riassumerli.'
principle: 'Non dichiarare mai che funziona senza prove con screenshot dalla produzione (e da un viewport mobile reale); mostra gli screenshot, non riassumerli.'
severity: non-negotiable
tags: [process, testing, production, screenshots, mobile, verification]
sources:
  - project: 'uno strumento di osservabilità in produzione'
    date: 2026-04-18
    note: 'nessun "funziona" senza screenshot dalla prod; mostra, non riassumere'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-19
    note: 'mobile = cartella di screenshot di ogni pagina partendo dalla home'
related:
  - process/desktop-target-first
  - tooling-runtime/drive-the-real-browser-over-mcp
  - design-ux/mobile-proof-real-devices
order: 4
updated: 2026-06-10
---

"Funziona" senza prove non è stato dimostrato. Test verdi in locale, una pipeline CI
che passa e un dev server funzionante sono tutti necessari, ma nessuno di questi
dimostra che il deploy in produzione sia corretto. La produzione gira con un insieme
diverso di condizioni: asset che possono essere obsoleti per via di un service worker
in cache, branch pin lasciati nello storage del browser, header CSP differenti, una
cache CDN che si comporta secondo i propri tempi. Ognuna di queste cose ha rotto la
produzione dopo che locale e CI erano tornati entrambi verdi, più di una volta.

La regola è inderogabile: ogni dichiarazione di "finito" deve essere sostenuta da
screenshot dalla produzione, mostrati nella risposta, non riassunti.

## Perché conta

L'incidente dello strumento di osservabilità in produzione (2026-04-18) è il punto da
cui nasce questa regola, ed è nata da guasti reali. Quelli che l'hanno imposta:

1. **Service worker obsoleto che serve asset vecchi.** Un nuovo deploy era online, ma
   il browser veniva ancora servito da un service worker in cache che continuava a
   scaricare il bundle precedente. I test in locale giravano contro il codice nuovo
   mentre gli utenti in produzione vedevano il codice vecchio. Uno screenshot dall'URL
   di produzione, non da localhost, l'avrebbe colto sul momento.

2. **Branch sbagliato fissato in IndexedDB.** L'app salvava la sua configurazione in
   IndexedDB con chiave su un identificatore di branch. Un deploy su un branch diverso
   era corretto di per sé, ma una chiave obsoleta nell'IndexedDB del browser, rimasta
   da un deploy precedente, continuava a sovrascriverlo. Nessun test in locale tocca
   mai lo stato dell'IndexedDB di produzione.

3. **Cache CDN che serve HTML obsoleto.** Lo shell HTML era in cache sull'edge. Un
   deploy che cambiava i riferimenti agli hash degli asset nell'HTML era andato online
   all'origine, ma la CDN continuava a servire il vecchio HTML, così gli hash degli
   asset non corrispondevano più e la pagina non si caricava. Lo vedi nell'istante in
   cui fai lo screenshot della produzione, e non lo vedi mai in un ambiente di test.

Ognuno di questi era visibile entro pochi secondi dall'apertura dell'URL di produzione
reale in un browser, e invisibile da qualsiasi altro posto.

L'incidente mobile della SPA di amministrazione contenuti (2026-04-19) ha aggiunto il
fronte mobile: qualsiasi lavoro mobile definito "finito" senza verifica mobile su
browser reale non era in realtà finito. L'asticella di accettazione di quell'incidente
vale ancora. Il lavoro mobile è accettato solo come cartella di screenshot che copre
ogni pagina interessata al viewport mobile, partendo dalla home page.

## Come applicarlo

### Fare gli screenshot dalla produzione

Punta l'MCP di Chrome DevTools o l'API screenshot di Playwright all'URL di produzione.
Non localhost, non l'anteprima di staging, non il dev server. Lo screenshot deve venire
dallo stesso URL che aprirebbe un utente reale.

```ts
// Playwright against production — the URL is the deployed origin.
const page = await context.newPage();
await page.goto('https://your-production-domain.com/path');
await page.screenshot({ path: 'proof/feature-desktop.png', fullPage: true });
```

Allega i file degli screenshot alla PR o incollali nella risposta. Mostrali, non
descriverli. "La pagina sembra corretta" non prova niente; lo screenshot sì.

### Copertura del viewport mobile

Per ogni modifica che tocca una UI visibile su mobile:

1. Apri Chrome DevTools sull'URL di produzione.
2. Attiva l'emulazione del dispositivo o collega un dispositivo reale.
3. Parti dalla home page e naviga verso ogni pagina interessata dalla modifica.
4. Fai uno screenshot di ogni pagina al viewport mobile.

La struttura delle cartelle per un giro di verifica mobile:

```
proof/
  mobile/
    01-home.png
    02-article-list.png
    03-article-detail.png
    04-settings.png
```

Ogni pagina, in ordine, partendo dalla home. Allega la cartella alla PR. Una pagina
mancante significa che la verifica mobile è incompleta.

### Cosa conta come produzione

La produzione è l'ambiente a cui accedono gli utenti reali. In ordine di preferenza:

1. Il dominio di produzione live.
2. Un ambiente di staging identico alla produzione in tutte le caratteristiche di
   runtime (stessa CDN, stesso service worker, stesse env var integrate).

Un deploy di anteprima Vercel dal branch della PR va bene per la verifica pre-merge se
è il deploy che diventerà produzione, cioè se gira sulla stessa infrastruttura. Un dev
server Vite non conta.

### Il controllo del service worker

Se l'applicazione usa un service worker, la verifica con screenshot dalla produzione
deve confermare che sia attiva la versione corretta del service worker:

1. Apri DevTools → Application → Service Workers.
2. Conferma che la versione del service worker corrisponda al commit deployato.
3. Se il vecchio service worker è ancora attivo, clicca "Update" o cancella i dati del
   sito e ricarica.
4. Rifai gli screenshot dopo aver confermato che gira la versione corretta.

Uno screenshot dalla produzione con un service worker obsoleto ancora attivo non prova
niente.

### Console e rete

Dopo aver fatto gli screenshot visivi, controlla la console DevTools e il pannello di
rete:

- Nessun errore non gestito.
- Nessuna richiesta di rete fallita (4xx o 5xx su risorse da cui l'app dipende).
- Nessuna violazione della Content Security Policy.

Se compare una di queste cose, la funzionalità non è finita. È rotta in produzione.

## Anti-pattern

**Riassumere gli screenshot invece di mostrarli.** "Ho verificato su mobile e sembra a
posto" non è una verifica mobile. Gli screenshot devono essere visibili nella risposta
o allegati alla PR.

**Usare il dev server come proxy della produzione.** `localhost:5173` non è la
produzione. Service worker, cache CDN e integrazione delle variabili d'ambiente lì non
si applicano mai.

**Controllare solo la pagina modificata.** Una modifica a un componente condiviso o a
uno stile globale può rompere pagine che nessuno ha testato esplicitamente. È
esattamente per questo che la cartella di verifica mobile parte dalla home page.

**Spacciare lo screenshot della CI per lo screenshot di produzione.** La CI fa lo
screenshot di un browser Playwright contro una build di sviluppo o un URL di anteprima.
A meno che quell'URL non sia l'effettivo deploy di produzione con le stesse
caratteristiche di runtime, non conta come prova di produzione.

**Saltare il controllo per modifiche "banali".** Il guasto del service worker obsoleto
è venuto da quella che sembrava una banale modifica a un asset. Non esiste una soglia
sotto la quale si possa saltare la verifica in produzione.

## Applicazione

La definition of done della consegna: una PR è completa quando include screenshot dalla
produzione (desktop e mobile se c'è di mezzo la UI) allegati o incorporati nella
descrizione della PR. Una PR senza screenshot per una modifica alla UI non è pronta per
il merge.

L'override permanente: se ti viene detto di collegarti a un'istanza di Chrome o di
aprire il browser tramite un token e lo ignori a favore di un test locale, il lavoro non
è finito. Una richiesta di usare un browser o un ambiente specifico va seguita così
com'è stata data.
