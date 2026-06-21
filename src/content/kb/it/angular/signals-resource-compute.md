---
title: 'Signal, resource e computed — niente effect per le derivazioni'
category: angular
summary: 'Tieni lo stato nei signal, deriva i valori con computed, carica i dati asincroni con resource e limita effect agli effetti collaterali creati una sola volta nel costruttore.'
principle: 'Tieni lo stato nei signal; deriva con computed e carica con resource; crea effect solo nel costruttore; non usare mai effect per aggiornare valori.'
severity: strong
tags: [angular, signals, reactivity, computed, resource, effect]
sources:
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'signal/resource/compute; effect solo nel costruttore; niente effect-to-set.'
related:
  - angular/services-as-functions
  - angular/control-flow-blocks-not-directives
order: 3
updated: 2026-06-10
---

I Signal di Angular, arrivati con Angular 17, sostituiscono il modello mentale RxJS-first per
lo stato dei componenti. Lo stato vive in un signal, le derivazioni sono valori computed e i dati
asincroni provengono da chiamate a `resource()`. Nessuno di questi ha bisogno di `effect`. `effect` è una
via di fuga per gli effetti collaterali che non puoi esprimere come trasformazione pura, quindi usarlo
per riscrivere uno stato derivato dentro un altro signal ricrea esattamente i problemi di tempistica e
ordinamento che rendevano difficile ragionare sul codice Angular imperativo.

La regola ha tre parti:
1. Lo stato mutabile vive in `signal()`.
2. I valori derivati sono `computed()` — mai signal riassegnati.
3. I dati asincroni sono `resource()` — mai un effect che esegue il fetch e poi chiama `.set()`.

## Perché conta

Scrivere `effect(() => { this.derived.set(transform(this.source())); })` viene dall'abitudine.
Con le proprietà `@Input()` e `ngOnChanges` collegavi le reazioni a mano. I signal rendono
quel lavoro inutile, e la differenza va ben oltre lo stile.

Un `effect` che imposta un altro signal crea un grafo di dipendenze indiretto. Angular
valuta gli effect in modo asincrono, dopo il ciclo di change detection. Quando due effect
leggono e scrivono entrambi signal correlati, l'ordine di esecuzione non è garantito. Il sintomo
tipico è un template che renderizza uno stato intermedio: il primo signal si è aggiornato, l'effect
che doveva aggiornare il secondo non è ancora partito, e il template vede una coppia incoerente.
`computed` è sincrono e referenzialmente trasparente. Si rivaluta nell'istante in cui le sue
dipendenze cambiano, nello stesso tick, quindi non produce mai uno stato intermedio osservabile.

`resource` risolve lo stesso problema per il lavoro asincrono. Prima che esistesse, il pattern era
`effect(() => { fetchData(this.id()).then(data => this.data.set(data)); })`. Quell'effect
girava ogni volta che `id` cambiava, ma la cancellazione era a carico tuo, e una prima richiesta
lenta poteva sovrascrivere una seconda richiesta veloce. `resource` gestisce il ciclo di vita della
richiesta, la cancellazione tramite `AbortSignal`, e gli stati di caricamento ed errore come valori
signal di prima classe.

Le proprietà devono essere `readonly` a meno che non siano signal o output. Dichiarare una proprietà
di classe mutabile e assegnarle un valore da un lifecycle hook è il vecchio pattern; sotto `OnPush`
aggira del tutto il tracciamento della change detection.

## Come applicarla

### Stato mutabile: signal()

```typescript
// Bad — plain mutable property; bypasses signal tracking
@Component({ /* ... */ })
export class CounterComponent {
  count = 0;

  increment(): void {
    this.count++;
  }
}

// Good — signal holds state; template auto-tracks reads
@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <output>{{ count() }}</output>
    <button (click)="increment()">+</button>
  `,
  styles: [`:host { display: flex; gap: 1rem; align-items: center; }`],
})
export class CounterComponent {
  readonly count = signal(0);

  readonly increment = (): void => this.count.update(n => n + 1);
}
```

Tutte le proprietà sono `readonly`. `count` è un `Signal<number>`, un riferimento readonly a un
contenitore reattivo. `signal()` restituisce un `WritableSignal`; il `readonly` sulla proprietà
impedisce di sostituire il riferimento al signal, non il suo valore.

### Valori derivati: computed()

```typescript
// Bad — effect writes derived state into a second signal
@Component({ /* ... */ })
export class CartComponent {
  readonly items = signal<CartItem[]>([]);
  readonly total = signal(0); // derived — should never be a writable signal

  constructor() {
    effect(() => {
      // Runs asynchronously after CD; total may lag items by one cycle
      this.total.set(this.items().reduce((s, i) => s + i.price * i.qty, 0));
    });
  }
}

// Good — computed is synchronous and always consistent with its dependencies
@Component({
  selector: 'app-cart',
  standalone: true,
  template: `
    <p>Total: {{ total() | currency }}</p>
    @for (item of items(); track item.id) {
      <app-cart-item [item]="item" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class CartComponent {
  readonly items = signal<readonly CartItem[]>([]);

  // Recomputes synchronously when items() changes; never lags behind
  readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + item.price * item.qty, 0),
  );
}
```

`computed` è lazy e memoizzato. Ricalcola solo quando una dipendenza cambia, e solo
quando qualcosa legge davvero il valore computed. Un equivalente basato su `effect` rigira anche
quando nessuno legge `total`.

### Dati asincroni: resource()

`resource` modella l'intero ciclo di vita di un'operazione asincrona (idle, loading, resolved,
errored) come signal. La funzione loader riceve un contesto reattivo, e Angular la riesegue
automaticamente quando cambia un qualsiasi signal letto al suo interno.

```typescript
import { resource, signal, computed } from '@angular/core';

// Bad — effect fetches and mutates; no cancellation; race condition possible
@Component({ /* ... */ })
export class UserProfileComponent {
  readonly userId = input.required<string>();
  readonly user = signal<User | undefined>(undefined);
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      this.loading.set(true);
      fetchUser(this.userId()).then(u => {
        // If userId changed before this resolved, we write stale data
        this.user.set(u);
        this.loading.set(false);
      });
    });
  }
}

// Good — resource manages loading state, cancellation, and error in one call
@Component({
  selector: 'app-user-profile',
  standalone: true,
  template: `
    @if (userResource.isLoading()) {
      <app-spinner />
    } @else if (userResource.error()) {
      <app-error-message [error]="userResource.error()" />
    } @else if (userResource.value(); as user) {
      <app-user-card [user]="user" />
    }
  `,
  styles: [`:host { display: block; }`],
})
export class UserProfileComponent {
  readonly userId = input.required<string>();

  readonly userResource = resource({
    request: () => ({ id: this.userId() }),
    loader: ({ request, abortSignal }) =>
      fetchUser(request.id, { signal: abortSignal }),
  });
}
```

Angular fornisce l'`abortSignal` e lo cancella automaticamente quando `userId` cambia
prima che il fetch precedente sia completato, quindi la race condition sparisce.

### Quando effect è legittimo

`effect` è adatto agli effetti collaterali che non possono essere espressi come valore: logging,
scrittura verso un'API DOM esterna, inizializzazione di una libreria di terze parti. Va creato
**nel costruttore** e non deve chiamare `.set()` su nessun signal.

```typescript
@Component({ /* ... */ })
export class MapComponent {
  readonly center = input.required<LatLng>();
  private readonly mapInstance: google.maps.Map;

  constructor() {
    this.mapInstance = new google.maps.Map(/* ... */);

    // Legitimate: syncing an external, non-signal API
    effect(() => {
      this.mapInstance.setCenter(this.center());
    });
  }
}
```

Creare un `effect` fuori dal costruttore non è supportato dalle regole sul contesto di injection
di Angular a meno di passare un injector esplicito, e passarne uno di solito è il segno che
l'effect dovrebbe comunque stare dentro il costruttore.

## Anti-pattern

```typescript
// Anti-pattern 1: effect to derive state — the classic wrong move
effect(() => {
  this.fullName.set(`${this.firstName()} ${this.lastName()}`);
});
// Use: readonly fullName = computed(() => `${this.firstName()} ${this.lastName()}`);

// Anti-pattern 2: effect to fetch data
effect(() => {
  fetch(`/api/users/${this.userId()}`).then(r => r.json()).then(u => this.user.set(u));
});
// Use: resource() with a loader function.

// Anti-pattern 3: writable signal for derived data
// Making total writable implies it can be set externally, which is a lie —
// it is always recalculated from items.
readonly total = signal(0); // should be computed
// Use: readonly total = computed(() => sumItems(this.items()));

// Anti-pattern 4: effect created outside the constructor
ngOnInit(): void {
  // Angular may not have an injection context here; this can throw
  effect(() => { /* ... */ });
}
// Use: move to constructor().

// Anti-pattern 5: unused declared properties
// Declaring a property that is never read in the template or by any method is dead
// code. Signals make this visible because the template only calls what it needs.
readonly legacyFlag = signal(false); // never read — delete it
```

## Come farla rispettare

Il modificatore `readonly` di TypeScript sulle proprietà signal impedisce riassegnazioni accidentali.
L'Angular Language Service segnala le letture di signal senza `()` nei template. Oltre a
questo, il vincolo "effect solo nel costruttore" è una regola di code review:

- Qualsiasi chiamata a `effect()` fuori dal corpo di un costruttore blocca la review.
- Qualsiasi corpo di `effect` che contiene una chiamata a `.set()` o `.update()` su un signal blocca la
  review, a meno che non sia accompagnato da una giustificazione registrata.

Al momento nessuna regola di lint automatica copre il caso "niente `.set()` dentro `effect`" nella sua
forma generale, ma il `no-restricted-syntax` di ESLint può approssimarlo per i pattern comuni.
Il vero strumento di controllo è la chiarezza architetturale: quando devi aggiornare un signal da una
sorgente reattiva, lo strumento giusto è `computed` o `resource`, e una volta che il team sa cosa
cercare la differenza salta all'occhio.
