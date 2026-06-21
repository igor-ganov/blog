---
title: 'secret-manager: segreti usa e getta via Telegram'
description: 'Un nuovo piccolo strumento — un bot Telegram che trasforma un valore in un link apribile una volta sola. Questo è l''annuncio, con gli appunti di costruzione: un dominio che gira su due runtime, link che sopravvivono alle anteprime, e i vincoli di Telegram che hanno guidato ogni scelta.'
date: 2026-06-14
tags: [product, platform, security]
order: 7
---

Strumento nuovo, volutamente piccolo: [**secret-manager**](https://github.com/igor-ganov/secret-manager),
online come [@secret_manager_bot](https://t.me/secret_manager_bot). Mandagli un valore e
ti risponde con un link che lo rivela **una volta sola**, poi restituisce
`410 Gone` per sempre. Niente account, niente app da installare; una chat Telegram è
l'intera interfaccia.

Lo usi quando devi passare una password o una chiave API a qualcuno senza lasciarla
parcheggiata nella cronologia della chat. La funzione in sé è stata facile. La parte
interessante è stata far sì che "una volta" significhi davvero una volta, su una
piattaforma che ti rema contro.

## Cosa fa

- Manda un `value` da solo → un link usa e getta, **niente viene salvato**.
- Manda `key value` → la coppia finisce sul tuo account Telegram *e* ricevi un link
  usa e getta verso il valore.
- La **lista** (pulsante o `/list`) gestisce le chiavi salvate; ogni riga offre **get** (un
  nuovo link usa e getta), **set** (sovrascrivi il valore) e **✕** (elimina dietro
  conferma).
- Ogni link vive cinque minuti (configurabile) e si apre una volta. I segreti sono legati
  al tuo id utente Telegram — una chiave primaria composta `(user_id, key)` — quindi due
  utenti non vedono mai le chiavi l'uno dell'altro.

## Un dominio, due runtime

L'architettura esiste perché la logica di business non sappia dove gira. Lo storage sono
tre piccole porte, `OneTimeLinkStore`, `SecretStore` e `PendingSetStore`, ognuna con
due adattatori collegati al punto di ingresso e da nessun'altra parte. È la divisione
[functional core / imperative shell](/essays/functional-core-imperative-shell)
resa concreta: chiusure invece di classi, dipendenze iniettate, il core che riceve i
suoi effetti invece di andarseli a prendere.

- **In locale** (`main.ts`): bot in long-polling, `bun:sqlite`, token usa e getta tenuti
  in memoria, `Bun.serve` per il server dei link.
- **In produzione** (`worker.ts`): un Cloudflare Worker su webhook, con D1 dietro a
  tutto — segreti, link e lo stato della conversazione.

Stesso `createBot`, stesso handler dei link, due composizioni. Lo store dei token in
memoria ha una proprietà piacevole: un riavvio invalida ogni link ancora in giro. Per
chi condivide segreti è il modo *sicuro* di fallire, quindi l'ho lasciato così.

## Far sì che "una volta" significhi una volta

La garanzia poggia su tre decisioni.

- **Token non indovinabili.** Ognuno è la concatenazione di due valori
  `crypto.randomUUID()` senza i trattini, 256 bit di casualità, ben oltre la
  forzabilità dello spazio degli URL.
- **Lettura-e-distruzione atomica.** Il consumo è una singola istruzione
  `DELETE … RETURNING value`. La riga sparisce nella stessa istruzione che la
  restituisce, così un link non può essere servito due volte nemmeno quando due
  richieste se lo contendono. Non c'è una finestra leggi-poi-cancella da perdere.
- **La rivelazione è una POST, non una GET.** Questa me l'ha insegnata un bug. La
  prima versione consumava il segreto su `GET /s/<token>`, e la primissima GET è quella
  del crawler delle anteprime di Telegram, che scarica l'URL per costruire la card in
  chat pochi millisecondi dopo l'invio del messaggio. Ogni link moriva a età zero,
  bruciato da una miniatura che nessuno aveva chiesto. È il classico bug della
  [**GET che muta**](/essays/security-bugs-by-type), che arriva da un client di chat
  invece che da un prefetcher di posta. Ora la `GET` serve una pagina di conferma non
  distruttiva con un pulsante **Reveal secret**, e solo la `POST` dietro a quello
  esegue il consumo. Crawler, scanner antivirus e riscrittori di link sicuri trovano la
  porta; solo un clic vero la apre.

Quest'ultima decisione ha portato anche una comodità. Dato che la rivelazione è una
semplice POST verso un URL stabile, non serve alcun browser. Il bot allega un
`curl -X POST <link>` pronto da copiare accanto a ogni link, così uno script può
recuperare e spendere un segreto in una riga.

## I limiti di Telegram hanno modellato il design

Metà delle decisioni interessanti discende da un solo limite della piattaforma: **i dati
di callback sono limitati a 64 byte.** Quell'unico numero detta diverse cose.

- **Chiavi da 62 byte.** Due byte vanno al prefisso d'azione di un carattere (`g:`,
  `s:`, `d:`, `D:`), il che lascia 62 byte alla chiave, validata sulla lunghezza reale
  in byte UTF-8 anziché sul conteggio dei caratteri. Le chiavi troppo lunghe vengono
  rifiutate con un messaggio chiaro invece di essere troncate in silenzio fino a una
  collisione.
- **Una codifica compatta del callback.** I pulsanti delle inline-keyboard non possono
  trasportare un blob JSON, quindi le azioni sono codificate come un minuscolo prefisso
  più la chiave, poi riportate a una discriminated union tipizzata. La tastiera parla
  cinque byte e l'handler parla tipi.

Altre due scelte modellate dalla piattaforma.

- **Lo stato conversazionale ha bisogno di una casa.** "Premi *set*, poi mandami il
  nuovo valore" è uno scambio in due messaggi, quindi una tabella `pending_sets` (o una
  mappa in memoria, in locale) ricorda l'intento a metà tra un update e l'altro.
- **Il worker scopre la propria origine.** I link generati hanno bisogno di un URL
  assoluto, e il Worker legge la sua origine pubblica direttamente dalla richiesta in
  arrivo. In produzione non serve alcuna configurazione di `BASE_URL`, e lo stesso
  codice serve qualunque dominio gli metti davanti.

## Igiene che è costata poco

La pagina del segreto è renderizzata con escaping HTML nel punto di iniezione e spedita
con gli header `no-store`, `noindex` e `no-referrer`, così il valore non finisce mai in
una cache, in un indice di ricerca o in una fuga via referer verso l'hop successivo.
Niente di tutto questo è costato molto. Ho deciso il modello di minaccia prima di
scrivere l'handler invece che dopo, e il resto è venuto da sé.

## Provalo

Apri [@secret_manager_bot](https://t.me/secret_manager_bot), mandagli un valore,
condividi il link. Il codice è su [GitHub](https://github.com/igor-ganov/secret-manager):
Bun, grammY, TypeScript strict senza vie di fuga, e la stessa divisione ports-and-adapters
che questo post descrive. È piccolo di proposito, e la disciplina vive negli angoli.
