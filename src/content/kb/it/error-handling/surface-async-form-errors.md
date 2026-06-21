---
title: "Non azzerare lo stato del form prima che l'handler asincrono si risolva"
category: error-handling
summary: "Chiamare reset() in modo sincrono subito dopo emit('create') scarta il form prima che l'handler asincrono del genitore parta, producendo una rejection non gestita, un form vuoto e nessun errore visibile."
principle: 'Non azzerare mai lo stato del form in modo sincrono subito dopo aver emesso un evento verso un handler asincrono del genitore; sposta il reset in un watcher legato alla visibilità e racchiudi sempre l''handler del genitore in un try/catch che mostri l''errore.'
severity: preferred
tags: [error-handling, forms, async, vue, ui]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-04-12
    note: 'reset sincrono prima del genitore asincrono → rejection non gestita, form vuoto, nessun errore; sposta il reset nel watcher + try/catch'
related:
  - error-handling/never-swallow-errors
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-04-12
---

Un dialog con un form emette un evento per far partire un handler asincrono del genitore, e
la mossa allettante è chiamare `reset()` subito dopo `emit(...)` così il form sembra pulito
mentre il genitore lavora. La trappola è l'ordine. `emit` è sincrono: esegue l'handler del
genitore sullo stack di chiamate corrente. Un genitore `async` restituisce subito una
`Promise`, e il figlio non vede mai quella `Promise`, quindi non può attenderla. Così
`reset()` parte prima ancora che il primo `await` dell'handler si sia risolto. Se a quel
punto l'handler lancia un'eccezione (errore di rete, validazione fallita, una rejection
dell'API), il genitore non ha nessuna clausola catch, la rejection resta non gestita, il
form è già svuotato e l'utente non vede né l'errore né i dati che aveva digitato.

Quindi la regola è: **non azzerare mai lo stato del form in modo sincrono subito dopo aver
emesso un evento verso un handler asincrono del genitore.** Sposta il reset in un `watch`
legato alla prop `show` del dialog, e racchiudi ogni handler del genitore che il dialog può
attivare in un `try/catch` che instradi i fallimenti verso uno stato di errore visibile.

## Perché conta

Il 2026-04-12 il flusso di creazione contenuti su una SPA di content-admin ha smesso di
mostrare gli errori. I redattori segnalavano che il dialog "Crea" a volte si chiudeva
all'istante con un form vuoto, senza conferma che qualcosa fosse stato salvato e senza un
errore che spiegasse cosa fosse andato storto.

La causa stava in `CreateContentDialog`:

```ts
// Simplified reproduction of the 2026-04-12 state.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // ← runs before the parent's async handler does anything meaningful
};
```

E nella view del genitore:

```ts
// Parent handler — async, no try/catch.
const handleCreate = async (data: ContentData): Promise<void> => {
  await contentService.create(data); // throws if the service worker returns an error
  show.value = false;
};
```

Ordine di esecuzione:

1. `emit('create', formData.value)` — l'`handleCreate` del genitore viene chiamato in modo
   sincrono.
2. `handleCreate` nel genitore chiama `contentService.create(data)`, che restituisce una
   `Promise` e si sospende al primo `await`.
3. Il controllo torna al figlio. `reset()` viene eseguito subito, svuotando il form.
4. La `Promise` del genitore si risolve o viene rifiutata. Se viene rifiutata:
   - Non c'è nessun `.catch` sulla `Promise` restituita da `handleCreate`.
   - Non c'è nessun `try/catch` nel genitore a racchiudere la chiamata.
   - La rejection diventa una unhandled promise rejection.
   - Nulla cambia nella UI — il dialog può essersi chiuso o no, il form è vuoto, l'errore è
     sparito.

Il redattore non aveva modo di sapere se il contenuto fosse stato salvato. Per il debug
bisognava collegare `window.addEventListener('unhandledrejection', ...)` nella console del
browser solo per vedere la classe dell'errore, che poi puntava al sottostante problema del
[confine di structured-clone di IDB](/kb/platform/idb-structured-clone-boundary) nella
stessa feature.

## Come applicarlo

### Sposta il reset in un watcher sulla visibilità

Lega `reset()` all'evento che segnala davvero il completamento: il dialog che diventa
nascosto. Quello scatta solo dopo che il genitore ha finito il suo lavoro asincrono e ha
impostato `show = false`.

```ts
// ❌ Before — reset fires synchronously while the async handler is mid-flight.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // premature; the parent has not finished
};

// ✅ After — reset fires when the dialog actually closes.
watch(
  () => props.show,
  (visible) => {
    if (!visible) reset();
  },
);

const handleCreate = (): void => {
  emit('create', formData.value);
  // no reset here — the watcher handles it
};
```

Questo garantisce tre cose:

1. I dati del form sono ancora presenti mentre l'handler del genitore è in esecuzione
   (utile per i retry).
2. Il reset avviene al massimo una volta per ogni evento di chiusura, indipendentemente da
   quante volte l'utente clicca il bottone di invio.
3. Se il genitore tiene aperto il dialog per mostrare un errore inline, i dati del form
   sopravvivono.

### Racchiudi ogni handler del genitore in un try/catch

Un handler `async` invocato dalla `emit` di un figlio non viene mai atteso dal figlio, e la
`Promise` che restituisce è invisibile lì. Se viene rifiutata, nulla intercetta la rejection
a meno che non lo faccia il genitore in modo esplicito.

```ts
// ❌ Before — unhandled rejection on any service error.
const handleCreate = async (data: ContentData): Promise<void> => {
  await contentService.create(data);
  show.value = false;
};

// ✅ After — error is caught and routed to the visible error ref.
const error = ref<string | undefined>(undefined);

const handleCreate = async (data: ContentData): Promise<void> => {
  error.value = undefined;
  try {
    await contentService.create(data);
    show.value = false; // only close on success
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Unexpected error — please retry.';
    // do not set show.value = false; keep the dialog open so the user can retry
  }
};
```

Mostra il ref `error` nel template del genitore, oppure passalo al dialog come prop, così
l'utente vede il fallimento senza perdere lo stato del form.

### Coppia completa corretta di dialog + genitore

```ts
// CreateContentDialog.vue (script setup)
import { ref, watch } from 'vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'create', data: ContentData): void }>();

const formData = ref<ContentData>(emptyContent());

// Reset only when the dialog closes — never synchronously on submit.
watch(
  () => props.show,
  (visible) => {
    if (!visible) formData.value = emptyContent();
  },
);

const handleCreate = (): void => {
  emit('create', formData.value);
};
```

```ts
// ContentView.vue (parent, script setup)
import { ref } from 'vue';

const show = ref(false);
const error = ref<string | undefined>(undefined);

const handleCreate = async (data: ContentData): Promise<void> => {
  error.value = undefined;
  try {
    await contentService.create(data);
    show.value = false; // triggers the watcher in the dialog → reset fires
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Create failed — please retry.';
    // show remains true; the dialog stays open; the form data is intact
  }
};
```

### Debug delle unhandled rejection

Quando indaghi su un sintomo del tipo "form vuoto, nessun errore", aggiungi questo all'inizio
della sessione di sviluppo:

```ts
// Temporary diagnostic — paste into the browser console.
window.addEventListener('unhandledrejection', (ev) => {
  console.error('Unhandled rejection:', ev.reason);
});
```

Una unhandled rejection qui significa quasi sempre che un handler asincrono invocato via
`emit` non ha `try/catch`. Verifica con l'inspector dei componenti dei Vue devtools per
confermare se il ref `error` viene effettivamente impostato.

## Anti-pattern

```ts
// ❌ Synchronous reset after emit — form blanks before the async work finishes.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // parent is mid-flight
};

// ❌ Async handler with no try/catch — errors vanish into unhandled rejections.
const handleCreate = async (data: ContentData): Promise<void> => {
  await contentService.create(data);
  show.value = false;
  // if create() throws, nothing here catches it
};

// ❌ Catching the error but still closing the dialog — the user loses their data.
const handleCreate = async (data: ContentData): Promise<void> => {
  try {
    await contentService.create(data);
  } catch {
    // swallowed — the dialog still closes, the form resets, the error is gone
  }
  show.value = false; // runs on both success and failure
};

// ❌ Resetting inside the emit handler on the assumption the parent is synchronous.
//    Works today, breaks the moment the parent goes async.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // "fine" as long as the parent never awaits — a time bomb
};
```

Ognuno di questi porta allo stesso sintomo visibile all'utente: il dialog si chiude o si
svuota, non compare nessun messaggio di errore, l'operazione può essere riuscita oppure no,
e l'utente riprova alla cieca.

## Enforcement

Questo è un controllo da code review, non una regola di lint:

1. Qualsiasi componente che emette un evento e chiama subito `reset()` o azzera stato
   reattivo nella stessa funzione sincrona è un candidato per questo bug.
2. Qualsiasi handler `async` del genitore registrato via `@create` / `@submit` / `@confirm`
   che non ha `try/catch` va segnalato e corretto.
3. Controlla che `show.value = false` (o la logica equivalente di chiusura del dialog) stia
   dentro il blocco `try`, non dopo — chiudere in caso di errore scarta l'input dell'utente.

## Vedi anche

La unhandled rejection prodotta da questo pattern è un caso di
[non ingoiare mai gli errori](/kb/error-handling/never-swallow-errors): la `Promise`
restituita da un handler `emit` asincrono viene scartata implicitamente, la variante
`void asyncFn()` di un errore ingoiato. Il problema di structured-clone di IDB trovato nella
stessa sessione di debug è trattato in
[confine di structured-clone di IDB](/kb/platform/idb-structured-clone-boundary).
