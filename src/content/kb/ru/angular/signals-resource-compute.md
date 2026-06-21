---
title: 'Signals, resource и computed — не effect для производных значений'
category: angular
summary: 'Состояние держите в сигналах, производные значения вычисляйте через computed, асинхронные данные грузите через resource, а effect оставьте только для побочных эффектов, создаваемых один раз в конструкторе.'
principle: 'Состояние держите в signals; производные — через computed, загрузку — через resource; effect создавайте только в конструкторе; никогда не обновляйте значения через effect.'
severity: strong
tags: [angular, signals, reactivity, computed, resource, effect]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'signals/resource/compute; effect только в конструкторе; никаких effect-to-set.'
related:
  - angular/services-as-functions
  - angular/control-flow-blocks-not-directives
order: 3
updated: 2026-06-10
---

Angular Signals, появившиеся в Angular 17, заменяют RxJS-first модель мышления для
состояния компонента. Состояние живёт в сигнале, производные значения — это computed,
а асинхронные данные приходят из вызовов `resource()`. Ничему из этого `effect` не нужен.
`effect` — это запасной выход для побочных эффектов, которые нельзя выразить как чистое
преобразование, поэтому хвататься за него ради записи производного состояния обратно
в другой сигнал означает заново создать ровно те проблемы с таймингом и порядком,
из-за которых императивный код на Angular было трудно понимать.

Правило состоит из трёх частей:
1. Изменяемое состояние живёт в `signal()`.
2. Производные значения — это `computed()`, а не переприсваиваемые сигналы.
3. Асинхронные данные — это `resource()`, а не effect, который грузит данные и потом зовёт `.set()`.

## Почему это важно

Привычка писать `effect(() => { this.derived.set(transform(this.source())); })` идёт
из прошлого. С `@Input()`-свойствами и `ngOnChanges` реакции приходилось разводить руками.
Сигналы делают эту работу ненужной, и разница тут далеко не только в стиле.

`effect`, который ставит другой сигнал, создаёт неявный граф зависимостей. Angular
выполняет эффекты асинхронно, после цикла обнаружения изменений. Когда два эффекта
читают и пишут связанные сигналы, порядок их выполнения не гарантирован. Типичный
симптом — шаблон, который рендерит промежуточное состояние: первый сигнал уже обновился,
эффект, который должен обновить второй, ещё не отработал, и шаблон видит несогласованную
пару. `computed` синхронен и ссылочно прозрачен. Он пересчитывается в тот же момент,
когда меняются его зависимости, в том же тике, поэтому никогда не выдаёт наблюдаемое
промежуточное состояние.

`resource` решает ту же задачу для асинхронной работы. До его появления паттерн выглядел
так: `effect(() => { fetchData(this.id()).then(data => this.data.set(data)); })`. Этот
effect срабатывал каждый раз при смене `id`, но отмена запроса висела на вас, а медленный
первый запрос мог перезаписать быстрый второй. `resource` берёт на себя жизненный цикл
запроса, отмену через `AbortSignal`, а также состояния загрузки и ошибки как полноценные
значения сигналов.

Свойства должны быть `readonly`, если только это не сигналы или выходы. Объявить изменяемое
свойство класса и присваивать ему из хука жизненного цикла — это старый паттерн; при `OnPush`
он полностью обходит отслеживание изменений.

## Как применять

### Изменяемое состояние: signal()

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

Все свойства — `readonly`. `count` имеет тип `Signal<number>` — readonly-ссылка на
реактивный контейнер. `signal()` возвращает `WritableSignal`; `readonly` на свойстве
запрещает заменить саму ссылку на сигнал, но не его значение.

### Производные значения: computed()

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

`computed` ленив и мемоизирован. Он пересчитывается только при изменении зависимости и
только когда кто-то реально читает вычисленное значение. Аналог на `effect` срабатывает
заново, даже когда `total` никто не читает.

### Асинхронные данные: resource()

`resource` моделирует полный жизненный цикл асинхронной операции (idle, loading, resolved,
errored) как сигналы. Функция-загрузчик получает реактивный контекст, и Angular запускает
её заново автоматически, когда меняется любой прочитанный внутри неё сигнал.

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

Angular выдаёт `abortSignal` и сам отменяет его, когда `userId` меняется до завершения
предыдущего запроса, так что гонка исчезает.

### Когда effect уместен

`effect` подходит для побочных эффектов, которые нельзя выразить значением: логирование,
запись во внешний DOM API, инициализация сторонней библиотеки. Его нужно создавать
**в конструкторе**, и он не должен звать `.set()` ни на одном сигнале.

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

Создание `effect` вне конструктора не поддерживается правилами контекста внедрения Angular,
если не передать явный инжектор, а передача инжектора обычно служит признаком того, что
эффекту всё равно место внутри конструктора.

## Антипаттерны

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

## Контроль соблюдения

Модификатор `readonly` в TypeScript на свойствах-сигналах предотвращает случайное
переприсваивание. Angular Language Service подсвечивает чтение сигналов без `()` в
шаблонах. Помимо этого, ограничение «effect только в конструкторе» — это правило
код-ревью:

- Любой вызов `effect()` вне тела конструктора блокирует ревью.
- Любое тело `effect`, содержащее вызов `.set()` или `.update()` на сигнале, блокирует
  ревью, если только оно не сопровождается записанным обоснованием.

Сейчас ни одно автоматическое правило линтера не покрывает случай «никаких `.set()` внутри
`effect`» в общем виде, но `no-restricted-syntax` из ESLint умеет приблизить его для
распространённых паттернов. Главный механизм контроля — архитектурная ясность: когда нужно
обновить сигнал из реактивного источника, правильный инструмент — это `computed` или
`resource`, и стоит команде один раз понять, на что смотреть, как разница становится
очевидной.
