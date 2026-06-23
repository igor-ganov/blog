---
title: 'Fai l''audit del tuo admin come se non l''avessi scritto tu'
description: 'Un self-audit di un pannello admin funzionante, nato come pet-project, ha trovato tre criticità in un pomeriggio: un proxy aperto come relay, una XSS persistente nell''anteprima dell''editor e un Service Worker confused deputy. Ognuna era un confine che si è spostato dopo che il codice era già stato scritto.'
date: 2026-06-11
tags: [security, platform, ci]
order: 5
---

L'admin aveva OAuth con PKCE, un file dei ruoli, query D1 parametrizzate, token di
disiscrizione firmati con HMAC e confronto a tempo costante, e JWT che verificavano la
firma prima di decodificarla. Secondo i criteri di una checklist era una codebase curata.
Un audit strutturato ha comunque trovato tre criticità in un pomeriggio, e lo schema che
le accomuna conta più dei singoli ritrovamenti: **ognuna era un confine che si è spostato
dopo che il codice intorno era già stato scritto.**

## Il proxy che ha perso il suo threat model in un cambio di porta

I browser non sanno parlare git smart-HTTP con GitHub, perché quegli endpoint non
portano header CORS, quindi l'admin fa da proxy al traffico git attraverso una piccola
route di un worker. L'implementazione originale era un Cloudflare Worker a sé stante, con
host pin fisso su `github.com` e un controllo `ALLOWED_ORIGINS`. A un certo punto il proxy
è stato spostato dentro l'app, su una route Hono dello stesso worker che serve la SPA.

Il porting ha tenuto le venti righe che facevano il lavoro e ha buttato via le dieci che
facevano la sicurezza. La route in produzione costruiva `https://${path}` direttamente dal
path della richiesta, rifletteva qualsiasi `Origin` e inoltrava ogni header
(`Authorization` compreso) verso l'host indicato dal path. È un relay aperto con inoltro
delle credenziali, piazzato sul dominio di produzione, [esattamente la cosa che la
versione standalone era stata costruita per non essere](/principles/platform/proxy-must-pin-targets).

Nessuno ha deciso di togliere l'allowlist. È evaporata nella traduzione, perché il porting
è stato rivisto come "stessa feature, posizione nuova" invece che come nuova superficie
d'attacco. Il codice che esiste per imporre un confine non sopravvive ai refactor per
inerzia. Sopravvive quando il confine è scritto da qualche parte dove il refactor è
costretto ad affrontarlo.

## Il pannello di anteprima che si fidava di chi scriveva

L'anteprima dell'editor passava l'output di `marked` dentro `v-html`, senza alcun
sanitizer nell'intero albero delle dipendenze. L'obiezione istintiva qui è "è il nostro
repo di contenuti, è input fidato", e cade nel momento in cui guardi chi scrive e chi
legge. Gli editor (il ruolo più basso) scrivono i post. Caporedattori e admin li
revisionano in quell'anteprima, loggati in sessioni il cui token GitHub porta `admin:org`.

Quindi c'è un confine di privilegio che passa proprio in mezzo a una feature, e [l'output
markdown è HTML dell'attaccante](/principles/platform/sanitize-html-before-injection) sul lato
sbagliato del confine. Un solo `<img onerror>` in una bozza, e il flusso di revisione
stesso consegna un token org-admin a chiunque abbia chiesto la revisione. La correzione è
una chiamata a DOMPurify nel punto di iniezione, più un file di test che elenca i vettori.
Il costo è quasi nullo. La parte difficile era solo accorgersi che "contenuto fidato" era
diventato in silenzio "contenuto da un livello di privilegio più basso".

## Il Service Worker che faceva quello che chiunque chiedeva

Il SW custodisce il token dell'utente ed espone route privilegiate: cambiare il ruolo org
di un utente, mandare un invito. Le route della config dei ruoli, lì accanto, controllavano
il ruolo del chiamante. Queste no. Chiunque potesse eseguire script same-origin poteva
fare POST di un'autopromozione ad admin, e il SW, [un classico confused
deputy](/principles/platform/confused-deputy-in-the-service-worker), la firmava con il token admin
salvato.

Concatenata con la XSS dell'anteprima, è da editor a org admin in un solo post costruito ad
arte. Ogni singolo ritrovamento, da solo, era un errore circoscritto, ma è la catena ad
aver reso il pomeriggio utile. Gli audit che si fermano a "trovata una XSS, apri un ticket"
si perdono il fatto che la gravità del ritrovamento N dipende dai ritrovamenti da N+1 a N+3.

## Anche il livello noioso era sbagliato

La CI aveva zero blocchi `permissions:` su nove workflow in due repo, ogni action ancorata a
un tag mutabile, e un PAT nell'env a livello di job su un trigger `pull_request`. Niente di
esotico. È lo [stato di default di GitHub
Actions](/principles/build-ci-deploy/least-privilege-workflows), che è esattamente il motivo per
cui è ovunque. La correzione è meccanica: un blocco permissions, SHA pin, dependabot per
tenerli aggiornati, segreti con scope per step dietro una guardia same-repo. Ci è voluto
meno tempo che a scriverlo.

Un altro default che vale la pena nominare. Il link di disiscrizione cambiava lo stato
dell'iscritto su GET. I client di posta fanno prefetch dei link, e gli scanner antivirus li
seguono, quindi la gente era a un passaggio di Outlook safe-links dall'essere disiscritta in
silenzio. Un handler GET che muta lo stato è una classe di bug, non una questione di stile.

## Cosa si generalizza davvero

- **Rifai l'audit dopo uno spostamento.** Un proxy spostato dentro l'app, un handler
  copiato per una route nuova, un flusso di auth sollevato in un popup: ogni porting
  riapre domande a cui l'originale aveva già risposto. Confronta le *protezioni*, non solo
  il comportamento.
- **Scrivi il threat model dove sta il codice.** L'host pin morto nel porting sarebbe
  sopravvissuto come modulo `cors-allow.ts` con test che verificano i 403. I test sono
  l'unica documentazione che un refactor è costretto a leggere.
- **Le etichette di fiducia marciscono.** "Contenuto fidato", "endpoint interno", "il
  nostro repo": ognuna di queste frasi in un commento è un TODO per controllare chi sta
  davvero da ciascun lato del confine oggi.
- **Audit in parallelo, fix in serie.** Tre passate mirate (superficie server,
  client/auth, CI/supply-chain) hanno trovato in poche ore quello che una singola passata
  generalista spalma su giorni. Le correzioni sono poi atterrate come un'unica PR
  revisionata, con un test per ogni ritrovamento.

La conclusione scomoda di un self-audit non è mai "il codice era sciatto". È che il codice
ha conservato fedelmente decisioni il cui contesto era ormai scaduto. L'igiene da checklist
ha retto ovunque: query parametrizzate, confronti a tempo costante, token firmati. A
fallire è stato tutto ciò che si era *spostato*.
