---
title: 'Bug di sicurezza, per tipo'
description: 'Un catalogo da campo, conciso, dei difetti di sicurezza che conviene riconoscere a colpo d''occhio — ciascuno come problema, rischio, correzione. Niente racconto, niente progetto. Confini, autenticazione, supply chain, disponibilità, esposizione.'
date: 2026-06-12
tags: [security, ci, platform]
order: 6
---

Una scheda da consultare al volo. Ogni voce è una classe di difetto in tre
parti: cos'è, perché morde, come si chiude. Raggruppate per il punto in cui il
difetto tende a vivere.

## Confini delle richieste

**Open relay / proxy SSRF.** Un proxy che costruisce l'URL upstream dal path
della richiesta e inoltra gli header del client. Rischio: chiunque può usare la
tua origine per raggiungere host arbitrari, e ogni `Authorization`/`Cookie`
inoltrato passa le credenziali a quegli host. Correzione: metti in allowlist
host *e* path tramite regex, valida l'`Origin` e rimuovi gli header di
auth/cookie prima di inoltrare.

**XSS stored tramite un sink di markup.** Markdown (o qualsiasi testo
dell'utente) reso in HTML e iniettato con `innerHTML`/`v-html` senza
sanificare. Rischio: l'output reso è HTML dell'attaccante, quindi `<img
onerror>` gira nella sessione di chi guarda, e chi guarda di solito ha più
privilegi dell'autore. Correzione: sanifica nel punto di iniezione (DOMPurify)
e tratta ogni stringa resa come ostile.

**Fallimento silenzioso attraverso un confine di fiducia.** Un handler che non
lancia un'eccezione su una risposta upstream non-OK, oppure un `catch` vuoto.
Rischio: un controllo di authz fallito o una scrittura parziale sembrano un
successo, così il passaggio di sicurezza viene saltato senza lasciare traccia.
Correzione: lancia un'eccezione a ogni `!res.ok` e non ingoiare mai un errore.
Rilancialo, loggalo o portalo in superficie.

## Autenticazione e autorizzazione

**Confused deputy.** Un endpoint privilegiato (cambio di ruolo, invito,
scrittura) che detiene un token potente ma non controlla mai l'autorizzazione
del *chiamante*. Rischio: qualsiasi script della stessa origine può far agire
il deputy con il suo token, per esempio per autopromuoversi ad admin.
Correzione: ricontrolla il ruolo del chiamante in ogni handler privilegiato,
non solo in quelli che capita di percepire come sensibili.

**OAuth senza `state`.** Un URL di authorize che omette il parametro `state` e
una callback che non lo valida. Rischio: login CSRF, dove un attaccante fissa
la vittima nella sessione dell'attaccante. Correzione: genera uno `state`
casuale, persistilo e rifiuta la callback in caso di mancata corrispondenza.

**`postMessage` verso `'*'`.** Inviare un token o un segreto a una target
origin wildcard. Rischio: qualsiasi origine che incornicia la pagina lo riceve.
Correzione: passa una target origin esplicita e in allowlist.

**GET che muta.** Un cambiamento di stato (disiscrizione, eliminazione, toggle)
dietro una richiesta GET. Rischio: prefetcher di posta, scanner di link e tag
`<img>` lo attivano tutti, quindi è CSRF-abile per costruzione. Correzione:
tieni la GET in sola lettura e sposta la mutazione su una POST dietro un passo
di conferma.

**Scope del token troppo ampio.** Un token tenuto nel browser che porta più
scope di quanto serva al client, come org-admin in una SPA pubblica. Rischio:
qualsiasi XSS o leak scala dritto fino a quello scope. Correzione: emetti lo
scope minimo per ciascun destinatario.

## Supply chain e CI

**Token di workflow permissivo per default.** Una pipeline senza blocco
`permissions:` gira con un token write-all. Rischio: qualsiasi step o action
compromesso può fare push di codice, tagliare release o modificare le issue.
Correzione: imposta `permissions: contents: read` a livello top, poi allarga
per-job solo dove un job ne ha davvero bisogno.

**Action non pinnata accanto a un segreto.** Una action di terze parti
referenziata da un tag mutabile in un job che detiene una credenziale. Rischio:
il proprietario del tag lo sposta, e la run successiva esegue il suo codice con
il tuo segreto. Nessun CVE richiesto. Correzione: pinna a un commit SHA, e fai
sì che un bot tenga i pin aggiornati così non marciscono.

**Scanning disattivato.** Secret scanning e push protection spenti. Rischio: una
credenziale committata non viene mai segnalata, e il push successivo può
aggiungerne un'altra. Correzione: attiva entrambi a livello di org, e classifica
i risultati onestamente così il segnale resta credibile. Una fixture di test
deliberata va risolta *come* fixture di test, non ignorata.

**Manifest morto = superficie d'attacco fantasma.** Un lockfile da cui hai
migrato ma che resta nell'albero. Rischio: gli scanner lo trattano come vivo e
sollevano alert (spesso critici) per dipendenze che nessuno installa, e quel
rumore ti allena a scorrere oltre gli alert veri. Correzione: cancella ogni
manifest che non usi più.

## Disponibilità e costo

**Risorsa illimitata su un backend a consumo.** Una room/canale/coda che accetta
partecipanti illimitati e campi messaggio senza limiti, fatturata per unità di
lavoro. Rischio: N partecipanti danno N² di amplificazione del broadcast, che è
un cost-DoS sul portafoglio di qualcun altro oltre alle esplosioni di memoria.
Correzione: limita i partecipanti, vincola ogni campo dello schema e rifiuta i
frame sovradimensionati attraverso il percorso di validazione esistente.

## Esposizione dei dati e privacy

**Classe di dati confidenziali in uno store pubblico.** Un repo (o bucket)
pubblico che accumula log, telemetria o allegati. Rischio: la *classe* di dati è
sensibile per quanto innocuo sembri il campione di oggi, e nessuno ri-revisiona
un sink dopo ogni cambio di schema. Correzione: giudica per classe di dati
anziché per contenuto attuale, e rendi privato lo store.

**Il cambio di visibilità rompe gli URL anonimi.** Portare uno store a privato
mentre i suoi asset sono referenziati da URL accessibili solo in anonimo, come i
link al contenuto raw. Rischio: gli asset o danno 404 a tutti, oppure lo store
resta pubblico per comodità. Correzione: referenzia gli asset tramite un URL
autenticato che controlla l'appartenenza, e accetta che gli embed anonimi siano
finiti.

**Identità nella storia di git.** Email o nomi personali cotti dentro i commit
attraverso i repo. Rischio: deanonimizzazione banale leggendo `git log`.
Correzione: riscrivi con un mailmap e fai force-push, ma conosci i limiti. I
metadati di PR/issue lato host e gli archivi pubblici degli eventi sopravvivono
alla riscrittura, quindi pianifica le rimozioni su quelle superfici a parte.

## Il filo

Quasi nessuno di questi è un exploit ingegnoso. Sono un confine che si è
spostato (un proxy traslocato, un repo diventato privato, un token allargato) o
un default che nessuno ha cambiato (un token write-all, lo scanning spento, un
flusso senza `state`). La forma è ciò che conviene portarsi dietro, perché
riconoscere la classe è gran parte del lavoro una volta che l'hai sistemata la prima volta.
