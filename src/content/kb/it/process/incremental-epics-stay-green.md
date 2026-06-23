---
title: 'Epic incrementali che restano verdi, in ordine'
category: process
summary: 'Ogni incremento è una singola issue con Obiettivo/Accettazione/Test/Fuori ambito/Dipende da; tutti i livelli di test restano verdi a ogni incremento; mai saltare avanti nell''ordine dell''epic.'
principle: 'Ogni incremento è una singola issue strutturata come Obiettivo / Accettazione / Test / Fuori ambito / Dipende da, di valore anche presa da sola; tutti i livelli di test restano verdi a ogni incremento; mai saltare avanti nell''ordine dell''epic — gli incrementi precedenti definiscono i contratti su cui poggiano quelli successivi.'
severity: strong
tags: [process, epics, incremental, testing, github-issues, green]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-30
    note: 'una issue per incremento; Obiettivo/Accettazione/Test/Fuori-ambito/Dipende; tutti i livelli verdi; nessun salto in avanti'
related:
  - process/spec-driven-ears-not-user-stories
  - testing/no-retries-no-flakes
order: 5
updated: 2026-06-10
---

Un'epic che arriva in una sola PR enorme è difficile da revisionare e difficile da
bisezionare quando qualcosa si rompe, e non puoi rilasciarne metà. Ma spezzarla in
incrementi non ti dà nulla se gli incrementi successivi saltano avanti o lasciano i
test in rosso. Resta comunque una PR enorme, solo travestita da diverse.

L'iniziativa offline della SPA di amministrazione contenuti (2026-04-30) si è fissata
su una struttura concreta. Ogni incremento è una singola issue GitHub. Il corpo della
issue segue uno schema fisso. Tutti e cinque i livelli di test restano verdi a ogni
incremento, senza eccezioni. E l'ordine dell'epic è rigorosamente sequenziale: la Fase
B è vincolata alla Fase A già unita e verde.

## Perché conta

L'iniziativa offline della SPA di amministrazione contenuti era il rilascio di una
capability in più fasi. Le fasi erano ordinate perché ciascuna stabiliva contratti da
cui dipendevano quelle successive: registrazione del service worker, chiavi di cache,
schema IDB, forma delle API. Salta la Fase A e implementa prima la Fase B, e il codice
della Fase B fa riferimento a contratti che ancora non esistono. A questo punto o scrivi
stub temporanei da rimuovere dopo, che è lavoro rifatto, oppure accorpi le due fasi in
un unico commit enorme, che annulla la struttura incrementale che cercavi.

La regola del verde-a-ogni-incremento ti compra la bisezionabilità. Mettiamo che una
regressione salti fuori dopo la Fase C. Se ogni incremento è stato unito verde,
l'intervallo di bisect è il codice di un singolo incremento. Allenta la regola, lascia
unire la Fase B con fallimenti noti «da sistemare nella Fase C», e la regressione
potrebbe nascondersi in uno degli angoli tagliati dalla Fase B.

Lo schema del corpo della issue non è decorazione. Obiettivo / Accettazione / Test /
Fuori ambito / Dipende da cattura ciò che a chi revisiona serve davvero per valutare la
PR: il risultato atteso, come sappiamo che è stato raggiunto, cosa è stato verificato,
cosa è stato deliberatamente rimandato e cosa deve essere già unito prima di partire.

## Come applicarlo

### Schema del corpo della issue

Ogni incremento di un'epic è una issue GitHub con questa esatta struttura nel corpo:

```markdown
## Goal
One paragraph. What capability does this increment deliver and why does it matter
in isolation? An increment that is only useful as setup for the next one is not an
increment — it is a prerequisite that should be folded into the next phase or
extracted into a smaller, self-contained deliverable.

## Acceptance criteria
- Bullet list of observable, verifiable outcomes.
- Each criterion maps directly to a test in the Tests section.
- Written from the user or system perspective, not the implementation perspective.

## Tests
- [ ] Unit: what unit tests cover the new logic
- [ ] Integration: what integration tests cover the interaction between components
- [ ] E2E mocked: what E2E scenarios run against a mocked backend
- [ ] E2E prod: what E2E scenarios run against the real production backend
- [ ] Manual: any manual verification steps (desktop app, mobile viewport, etc.)

## Out of scope
- Explicit list of things that were considered and deliberately deferred.
- This section prevents scope creep and documents why certain related things
  are not in this increment.

## Depends on
- List of issue numbers or PRs that must be merged before this can start.
- If empty, this increment can begin immediately.
```

### I cinque livelli di test

Tutti e cinque i livelli devono essere verdi quando la PR dell'incremento viene unita:

1. **Unit** — logica pura, modulo singolo, nessun I/O.
2. **Integration** — confini tra componenti, database, coda di messaggi o interazioni
   tra servizi.
3. **E2E mocked** — flusso completo dell'applicazione contro un backend mock
   controllato e prevedibile.
4. **E2E prod** — flusso completo dell'applicazione contro il backend di produzione
   reale.
5. **Manual** — verifica umana nel runtime reale (screenshot dell'app desktop, viewport
   mobile, console pulita).

«Tutti i livelli verdi» significa nessuno skip, nessun flake, niente rimandato
all'incremento successivo. Un test disabilitato con `test.skip` o `xit` per far passare
un merge è un test che fallisce. Vedi [niente retry, niente flake](/principles/testing/no-retries-no-flakes).

### Ordinamento dell'epic

Numera le fasi in modo esplicito: `epic.1`, `epic.2`, `epic.3`. La regola:

- `epic.N+1` non può iniziare finché `epic.N` non è unito e tutti i livelli sono verdi.
- `epic.N+1` non può fare riferimento a un contratto (API, schema, evento) che `epic.N`
  doveva stabilire ma che non è ancora stato revisionato e unito.

Se ti sorprendi a scrivere codice per `epic.3` perché `epic.2` è in revisione e vuoi
restare occupato, fermati. Vai a rispondere ai commenti di revisione su `epic.2` invece
di costruire in modo speculativo `epic.3` su contratti che potrebbero ancora cambiare.

### Isolamento di valore da MVP

Prima di scrivere la issue, chiediti: se ogni fase successiva venisse cancellata, questo
incremento varrebbe comunque la pena di essere unito? Se la risposta è no, il confine è
sbagliato, e di solito ci sono due cause:

- L'incremento è pura infrastruttura senza valore visibile all'utente. Valuta se
  l'infrastruttura e il suo primo consumatore possano arrivare come un unico incremento.
- L'incremento è una mezza feature che diventa utile solo quando atterra la successiva.
  Valuta se puoi aggiustare l'ambito per consegnare ora una versione completa e minima
  della feature.

«Vale la pena di essere unito da solo» non significa «completo». Una versione ridotta
all'osso che funziona da capo a fondo ha valore di per sé. Un commit di impalcatura
pieno di implementazioni segnaposto no.

## Anti-pattern

**Saltare avanti.** La Fase B parte prima che la Fase A sia unita perché «la Fase A è
praticamente finita». La Fase A è finita quando è unita e verde, non quando è in
revisione. I contratti che stabilisce non sono stabili finché non viene unita.

**Rimandare i fallimenti dei test.** Un test che copre il comportamento della Fase A
fallisce in modo intermittente, e qualcuno decide di unire ora e sistemarlo nella Fase
B. Quello non è un incremento, è debito tecnico codificato nella suite di test. Sistema
il test o sistema il codice prima di unire.

**Fuori ambito lasciato vuoto.** Una sezione «Fuori ambito» vuota di solito significa
che nessuno ha ragionato sul confine. Ogni decisione di feature rimanda qualcosa. Se non
ti viene in mente niente, non hai esaminato l'ambito con abbastanza attenzione.

**Criteri di accettazione non verificabili.** «La feature dovrebbe risultare reattiva»
non è un criterio. «WHEN the user clicks Save THE SYSTEM SHALL display the confirmation
within 200ms» lo è. I criteri di accettazione reggono lo stesso standard dei requisiti
EARS: testabili in modo indipendente.

**Obiettivo scritto come descrizione di un task.** «Implementare il modulo di
registrazione del service worker» è un task. «Gli utenti possono caricare l'app in
modalità offline-first dopo la prima visita» è un obiettivo. La sezione Obiettivo
descrive il risultato per l'utente o il sistema, non il lavoro fatto per arrivarci.

## Enforcement

La descrizione della PR fa riferimento al numero della issue e conferma che tutti e
cinque i livelli di test sono verdi. Unire senza una suite di test verde è una
violazione di processo, per quanto urgente sia il cambiamento. Quando la CI è flaky,
sistemi la flakiness prima di unire invece di aggirarla.

L'ordinamento dell'epic poggia sul campo «Dipende da» e sul non aprire una PR per
`epic.N+1` mentre `epic.N` è ancora non unito. Niente nel tooling lo impone, è una
regola di processo. Annotarla qui significa che ogni deviazione deve essere esplicita e
portare con sé una motivazione dichiarata.
