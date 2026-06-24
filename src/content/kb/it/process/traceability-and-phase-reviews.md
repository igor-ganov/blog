---
title: 'Revisioni di fase e tracciabilità end-to-end'
category: process
summary: 'Fermati per una revisione alla fine di ogni fase della spec; mantieni ogni requisito tracciabile fino a una sezione di design, un task e un test — in entrambe le direzioni.'
principle: 'Fermati per una revisione alla fine di ogni fase; mantieni tracciabile requisito ↔ sezione di design ↔ task ↔ test in entrambe le direzioni; correggi la spec (non il codice) quando la realtà diverge.'
severity: strong
tags: [process, spec-driven, traceability, reviews, documentation]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'revisioni di fase; tracciabilità obbligatoria; correggere la spec non il codice; attenzione alla deriva'
related:
  - process/spec-driven-ears-not-user-stories
  - process/incremental-epics-stay-green
order: 2
updated: 2026-06-10
---

La tracciabilità ti permette di partire da un test che fallisce e risalire fino al
requisito che lo imponeva, oppure di partire da un requisito e procedere in avanti fino
al test che lo dimostra. Senza di essa non puoi sapere se un'implementazione è completa,
se una modifica è sicura, o se un test che fallisce significa che il codice è sbagliato
o che lo è la spec. Il workflow spec-driven (formalizzato nello standard di ingegneria,
2026-06-02) tratta la tracciabilità come obbligatoria e non come documentazione
opzionale.

Le revisioni di fase sono il meccanismo che la fa rispettare. Una revisione è una pausa
deliberata al confine tra le fasi (requisiti → design, design → task, task →
implementazione) che verifica completezza e correttezza prima che inizi la fase
successiva. Correggere una spec costa la modifica di un paragrafo; correggere codice
costruito su una spec sbagliata significa smontare l'implementazione e i suoi test.

## Perché conta

L'asimmetria di costo è concreta. Un errore nei requisiti scoperto durante la code
review significa che l'implementazione è sbagliata, che i test sono sbagliati perché
hanno validato il comportamento sbagliato, che le decisioni di design dipendenti da quel
requisito potrebbero essere sbagliate, e che la PR va smontata prima di poter correggere
la spec e ripartire dal ciclo. Intercettato alla revisione requisiti-design, lo stesso
errore costa la modifica di un paragrafo.

Il modo di fallire da cui la tracciabilità protegge è la **deriva della spec**: la spec
dice una cosa, il codice diverge gradualmente, nessuno aggiorna la spec, e dopo qualche
incremento nessuno è più certo di cosa il sistema dovrebbe fare. La spec diventa
decorativa. Il rimedio non è scrivere spec migliori una volta sola. È la disciplina
permanente per cui la spec è autorevole e la divergenza scatena una correzione della
spec invece di un silenzioso adeguamento del codice.

Un fallimento collegato è lo **scope allucinato**: un'implementazione aggiunge un
comportamento che non era mai stato nella spec, spesso con buone intenzioni ("già che
c'ero ho anche…"). Resta invisibile finché non rompe qualcosa, o finché una code review
non scopre una funzionalità senza alcun requisito alle spalle.

## Come applicarlo

### Checkpoint delle revisioni di fase

Alla fine di ogni fase, prima di passare alla successiva, rispondi a queste domande:

**Dopo requirements.md:**
- Ogni capacità ha un gruppo con un nome e 4–8 voci EARS?
- Ogni voce è testabile in modo indipendente? (Riesci a scrivere il test dal solo criterio?)
- Le decisioni bloccate sono elencate esplicitamente e separate dai requisiti funzionali?
- Il confine dello scope è esplicito — cosa è fuori scope, e perché?

**Dopo design.md:**
- Ogni criterio EARS compare in almeno una sezione di design?
- Ogni sezione di design fa riferimento al/ai requisito/i che soddisfa?
- I compromessi sono registrati dove sono state valutate alternative?
- Il design non introduce alcun comportamento non richiesto dalla spec?

**Dopo tasks.md:**
- Ogni task fa riferimento alla sezione di design e al/ai requisito/i che implementa?
- Ogni requisito è coperto da almeno un task?
- I task sono ordinati in modo che ciascuno sia costruibile e testabile in isolamento?

Supera il checkpoint solo quando ogni domanda riceve un sì. Se una non lo riceve,
correggi l'artefatto prima di proseguire.

### La catena di tracciabilità

La catena completa per un requisito è così:

```
requirements.md
  REQ-4: WHEN a message has failed delivery 10 times THE SYSTEM SHALL
         move it to the dead-letter table and emit a metric.
         ↓
design.md
  ## Dead-letter handling (satisfies REQ-4)
  After 10 consecutive delivery failures the relay writes the message row
  to `outbox_dead_letter` and calls `metrics.increment('dlq.moved')`. …
         ↓
tasks.md
  TASK-7: Implement dead-letter promotion (REQ-4, design §Dead-letter handling)
          - Add `failure_count` column migration
          - Add promotion logic in OutboxRelay.attemptDelivery
          - Add metric emission
          - Write unit test for promotion threshold
         ↓
src/outbox/relay.ts  (references TASK-7 in commit message)
src/outbox/relay.test.ts
  describe('dead-letter promotion', () => {
    // REQ-4: 10 consecutive failures → DLQ + metric
    it('promotes after 10 failures', …);
    it('emits dlq.moved metric on promotion', …);
  });
```

La direzione inversa funziona allo stesso modo. Dato un test, puoi trovare il task, poi
la sezione di design, poi il requisito che lo imponeva.

### Quando la spec è sbagliata

L'implementazione rivela spesso errori nella spec. La risposta è una sequenza fissa:

1. **Fermati.** Non aggirare l'errore nel codice.
2. **Documenta la scoperta.** Scrivi una nota breve: cosa dice la spec, cosa richiede
   la realtà, perché differiscono.
3. **Correggi la spec.** Modifica `requirements.md` (o `design.md` se è un errore di
   design) con la correzione. Registra il ragionamento inline o in una sezione di
   cronologia delle revisioni del file della spec.
4. **Rivedi di nuovo.** La sezione corretta passa attraverso le stesse domande di
   checkpoint dell'originale. Se la correzione si propaga (una modifica a un requisito
   invalida decisioni di design), anche quelle sezioni vengono aggiornate.
5. **Continua.** Solo dopo che la spec è corretta l'implementazione riprende.

Questa non è burocrazia. È il lavoro minimo per mantenere la spec autorevole. Una spec
corretta una volta e rivista di nuovo è ancora una fonte di verità, mentre una spec che
il codice contraddice in silenzio è diventata un documento storico.

### Versionamento e collocazione

Le spec vivono accanto al codice, nel repository, in una cartella `docs/` o `specs/`
allo scope rilevante. Sono versionate con il codice: la correzione di una spec e la
modifica al codice che essa autorizza vanno nella stessa PR, o in commit adiacenti con
un riferimento chiaro. Una spec che vive in una wiki o in qualche sistema separato, non
versionata insieme al codice, va in deriva.

### La code review come verifica di aderenza alla spec

Ogni review di una PR include un passaggio di aderenza alla spec:

- L'implementazione corrisponde alla spec, né più né meno?
- Ogni task in `tasks.md` che questa PR dichiara di completare è davvero completo?
- Ogni nuovo comportamento ha un requisito alle spalle?
- Se la spec è stata corretta come parte di questa PR, la correzione passa attraverso le
  domande di checkpoint prima che l'implementazione venga accettata?

## Anti-pattern

**Implementare oltre un checkpoint fallito.** Il checkpoint ha rivelato che REQ-7 non ha
una sezione di design. Annotarlo e proseguire è la mossa sbagliata; aggiungi la sezione
di design e ricontrolla prima di scrivere una riga di codice per REQ-7.

**Correggere la spec per farla combaciare con il codice.** L'implementazione è diversa
e, invece di capire perché e decidere cosa sia corretto, qualcuno modifica la spec
perché dica ciò che fa il codice. Questa è razionalizzazione a posteriori, non una
correzione della spec. La correzione deve registrare il ragionamento dietro la modifica,
non solo la modifica.

**Tracciabilità come annotazione posticcia.** Aggiungere commenti `// REQ-4` dopo che
l'implementazione è completa è meglio di niente, ma non sostituisce la pianificazione a
monte. Il task deve riferirsi al requisito prima che il codice sia scritto, così che
l'implementazione sia guidata dalla spec, e non il contrario.

**Scope creep sotto un'intestazione plausibile.** Una sezione di design per "Dead-letter
handling" si ritrova una dashboard dei retry perché "era comodo." La dashboard non ha
alcun requisito, quindi è scope allucinato. Ogni elemento di design ha bisogno di un
riferimento a un requisito. Se il riferimento non esiste, o aggiungi un requisito
(attraverso il canale corretto, revisione inclusa) o rimuovi l'elemento.

## Applicazione

I checkpoint delle revisioni di fase sono applicati dal processo, non da uno strumento.
In pratica significa che nessuna PR viene aperta per lavoro di implementazione finché
`tasks.md` non esiste e non ha superato il suo checkpoint. Una PR che aggiunge
funzionalità senza una voce corrispondente nei task è incompleta per definizione.

La verifica della deriva della spec nella code review è l'ultima rete di sicurezza. Se
un revisore trova nella PR un comportamento senza un requisito alle spalle, la PR non
viene mergiata finché non si aggiunge il requisito (con una revisione) o non si rimuove
il comportamento.
