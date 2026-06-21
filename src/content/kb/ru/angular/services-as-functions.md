---
title: 'Сервисы как стрелочные функции; состояние — в классе с providedIn root'
category: angular
summary: 'Реализуйте сервисы без состояния как стрелочные функции, а состояние выносите в класс @Injectable({providedIn:"root"}), который получают через inject(), с раздельными функциями чтения и записи.'
principle: "Реализуйте сервис как стрелочную функцию; если ему нужно состояние, вынесите состояние в класс @Injectable({providedIn:'root'}), получаемый через inject, с раздельными функциями чтения и записи."
severity: preferred
tags: [angular, services, functional, inject, signals, architecture]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Сервисы-стрелки; состояние в корневом Injectable; функции чтения и записи.'
related:
  - angular/inject-and-host-bindings
  - functional-architecture/currying-closures-higher-order
order: 5
updated: 2026-06-10
---

Класс `@Injectable` в Angular — привычный контейнер для логики сервиса, и команды
тянутся к нему намного чаще, чем нужно. Сервису, который преобразует данные, проверяет
ввод или форматирует строку, класс не нужен. Ему нужна функция. Когда функции требуется
контекст, который она не может нести в себе, передайте этот контекст через замыкание.
Исключение — сервис, которому действительно надо хранить и разделять реактивное
состояние: тогда используйте класс, держите его логику декларативной и отдавайте
состояние через раздельные функции чтения и записи, а не через один метод, который делает
и то и другое.

Правило: **сначала стрелочная функция; injectable-класс — только когда нужно общее
реактивное состояние**.

## Почему это важно

Класс тащит за собой неявные возможности: создание экземпляра, `this`, изменяемые
свойства, жизненный цикл. Сервису, который вычисляет производное значение, ничего из
этого не нужно. Завернёте такое вычисление в класс только ради того, чтобы угодить
системе внедрения Angular, — и каждый читающий код вынужден гадать, где здесь логика,
чистая ли она и держит ли она состояние. Функция отвечает на все три вопроса сразу.

Граница между бизнес-логикой и средой выполнения Angular важнее. Практика DDD кладёт
бизнес-правила в насыщенную модель, которая ничего не знает о фреймворке, а стрелочная
функция независима от фреймворка по своей природе. Класс `@Injectable`, наоборот, привязан
к дереву внедрения Angular с того момента, как вы навесили на него декоратор. Логика,
живущая в чистых функциях, остаётся тестируемой сама по себе — без `TestBed`, без
фикстуры компонента, вообще без Angular в комнате.

Инженерный стандарт формулирует это так: «создавая сервис, реализуйте его как стрелочную
функцию; если ему нужно состояние, вынесите состояние в класс с `@Injectable providedIn
root`, получайте через `inject`, при необходимости создавайте раздельные функции чтения и
записи; бизнес-логику выносите в отдельные замыкания, стремясь к насыщенной модели в виде
класса, но держа его код декларативным».

## Как применять

### Сервис без состояния: стрелочная функция

Сервис, который отображает, фильтрует, вычисляет или форматирует, — это чистая функция.
Экспортируйте её прямо из модуля — никакого класса, никакого декоратора.

```typescript
// Bad — a class that exists only to hold one method
@Injectable({ providedIn: 'root' })
export class TicketFormatterService {
  format(ticket: Ticket): string {
    return `[${ticket.id}] ${ticket.title} (${ticket.status})`;
  }
}

// Bad — it is injected in the component as a class just to call one method
@Component({ /* ... */ })
export class TicketRowComponent {
  private readonly formatter = inject(TicketFormatterService);
  readonly label = computed(() => this.formatter.format(this.ticket()));
}

// Good — a pure function in a dedicated file
// features/tickets/common/ticket-formatter.ts
export const formatTicket = (ticket: Ticket): string =>
  `[${ticket.id}] ${ticket.title} (${ticket.status})`;

// The component imports and calls it directly — no injection needed
@Component({
  selector: 'app-ticket-row',
  standalone: true,
  template: `<span>{{ label() }}</span>`,
  styles: [`:host { display: block; }`],
})
export class TicketRowComponent {
  readonly ticket = input.required<Ticket>();
  readonly label = computed(() => formatTicket(this.ticket()));
}
```

Когда функции нужна зависимость (скажем, базовый URL для вызова API), передайте её
параметром или соберите функцию-фабрику через замыкание. Не хватайтесь за `@Injectable`
только ради того, чтобы вручить зависимость.

```typescript
// Factory function pattern: the dependency is captured in the closure
export const createTicketApi = (baseUrl: string) => ({
  list: (): Promise<readonly Ticket[]> =>
    fetch(`${baseUrl}/tickets`).then(r => r.json()),
  get: (id: string): Promise<Ticket> =>
    fetch(`${baseUrl}/tickets/${id}`).then(r => r.json()),
});

// Usage in a component or store — the baseUrl comes from an injected config
@Component({ /* ... */ })
export class TicketListComponent {
  private readonly config = inject(AppConfig);
  private readonly api = createTicketApi(this.config.apiBaseUrl);
}
```

### Сервис с состоянием: класс с providedIn root и разделением чтения и записи

Когда сервису действительно надо разделять реактивное состояние по всему приложению
(выбранный пользователь, очередь уведомлений, флаг функциональности), используйте класс
`@Injectable({ providedIn: 'root' })`. Держите его публичный API маленьким: одна функция
или сигнал для чтения состояния, одна функция для записи.

```typescript
// features/tickets/ticket-selection.store.ts

@Injectable({ providedIn: 'root' })
export class TicketSelectionStore {
  // Private writable signal — internal to the store
  private readonly _selectedId = signal<string | undefined>(undefined);

  // Public read — a readonly view; callers cannot .set() through this reference
  readonly selectedId: Signal<string | undefined> = this._selectedId.asReadonly();

  // Explicit write function — naming makes the intent clear
  readonly select = (id: string): void => this._selectedId.set(id);
  readonly clear = (): void => this._selectedId.set(undefined);
}
```

Хранилище получают в компонентах через `inject()`:

```typescript
@Component({ /* ... */ })
export class TicketDetailComponent {
  private readonly selection = inject(TicketSelectionStore);

  readonly ticketId = this.selection.selectedId;

  readonly ticket = resource({
    request: () => ({ id: this.ticketId() }),
    loader: ({ request }) =>
      request.id !== undefined
        ? fetchTicket(request.id)
        : Promise.resolve(undefined),
  });
}
```

Разделение чтения и записи не даёт компоненту случайно изменить глобальное состояние
через ссылку, которую он взял только ради чтения. Оно же делает изменения состояния
прослеживаемыми: каждая запись идёт через именованную функцию в хранилище, а не через
голый `.set()`, разбросанный по всей кодовой базе.

### Бизнес-логика в отдельных замыканиях

Логика модели — например, правило, что тикет можно закрыть только после назначения
исполнителя, — не место ни в хранилище, ни в компоненте. Положите её в замыкание слоя
домена.

```typescript
// domain/ticket.ts — framework-agnostic domain logic

export type Ticket = {
  readonly id: string;
  readonly title: string;
  readonly status: 'open' | 'in-progress' | 'closed';
  readonly assignee: string | undefined;
};

export const canClose = (ticket: Ticket): boolean =>
  ticket.assignee !== undefined && ticket.status !== 'closed';

export const close = (ticket: Ticket): Ticket =>
  canClose(ticket) ? { ...ticket, status: 'closed' } : ticket;
```

Компонент или хранилище вызывают `canClose` и `close`, а не переписывают правило заново
по месту. У файла домена ноль импортов Angular, и его можно проверить обычным блоком
`describe`/`it`.

## Антипаттерны

```typescript
// Anti-pattern 1: @Injectable for a stateless helper
// This forces TestBed into every test of the logic, adds DI boilerplate,
// and signals to readers that there is state — there is not.
@Injectable({ providedIn: 'root' })
export class DateFormatterService {
  formatShort = (date: Date): string =>
    date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// Fix: export const formatShortDate = (date: Date): string => ...

// Anti-pattern 2: Store with a public writable signal
@Injectable({ providedIn: 'root' })
export class UserStore {
  readonly currentUser = signal<User | undefined>(undefined); // writable signal, public!
}
// Any component can call userStore.currentUser.set(hackedUser).
// Fix: expose asReadonly() and a named mutator.

// Anti-pattern 3: Business logic inside the injectable
@Injectable({ providedIn: 'root' })
export class TicketService {
  canAssign(ticket: Ticket, user: User): boolean {
    // Domain rule buried inside an Angular service — untestable without DI
    return user.role === 'agent' && ticket.status === 'open';
  }
}
// Fix: extract canAssign to a pure function in the domain layer.

// Anti-pattern 4: Mixing read and write into one function
@Injectable({ providedIn: 'root' })
export class FilterStore {
  private readonly _filters = signal<Filter[]>([]);

  // A function that both returns the current state and mutates it — confusing
  filtersWithDefault(defaults: Filter[]): Filter[] {
    if (this._filters().length === 0) this._filters.set(defaults); // side-effect!
    return this._filters();
  }
}
// Fix: separate filters = this._filters.asReadonly() and setFilters = (f) => this._filters.set(f)
```

Эти схемы дают одни и те же симптомы снова и снова. Вы поднимаете `TestBed` ради логики,
у которой нет ни одной зависимости от Angular. Состояние меняется откуда угодно, и
проследить путь записи невозможно. Доменные правила гниют внутри слоя сервисов, где их
больше никто не может переиспользовать.

## Смотрите также

- [inject() и метаданные хоста](/kb/angular/inject-and-host-bindings) — парное правило о
  том, как зависимости потребляются внутри компонентов, когда сервис уже на месте.
- [Каррирование, замыкания и функции высшего порядка](/kb/functional-architecture/currying-closures-higher-order) —
  более широкий принцип функциональной архитектуры, из которого вырастают функции-фабрики
  и композиция сервисов на замыканиях.
