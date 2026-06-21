---
title: "Не сбрасывайте состояние формы до того, как разрешится асинхронный обработчик"
category: error-handling
summary: "Синхронный вызов reset() сразу после emit('create') очищает форму ещё до того, как отработает асинхронный обработчик родителя: получаем необработанный rejection, пустую форму и отсутствие видимой ошибки."
principle: 'Никогда не сбрасывайте состояние формы синхронно сразу после emit на асинхронный обработчик родителя; перенесите reset в watcher, привязанный к видимости, и всегда оборачивайте обработчик родителя в try/catch, который показывает ошибку.'
severity: preferred
tags: [error-handling, forms, async, vue, ui]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-04-12
    note: 'синхронный reset перед асинхронным родителем → необработанный rejection, пустая форма, ошибки нет; перенести reset в watcher + try/catch'
related:
  - error-handling/never-swallow-errors
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-04-12
---

Диалог с формой генерирует событие, чтобы запустить асинхронный обработчик родителя, и
напрашивается решение вызвать `reset()` сразу после `emit(...)` — чтобы форма выглядела
чистой, пока родитель работает. Ловушка в порядке выполнения. `emit` синхронный: он
выполняет обработчик родителя в текущем стеке вызовов. `async`-родитель сразу возвращает
`Promise`, но ребёнок этого `Promise` не видит и не может его дождаться. Поэтому `reset()`
отрабатывает раньше, чем разрешится первый `await` в обработчике. Если обработчик потом
бросит исключение (ошибка сети, провал валидации, отказ API), у родителя нет catch,
rejection остаётся необработанным, форма уже очищена, и пользователь не видит ни ошибки,
ни введённых данных.

Отсюда правило: **никогда не сбрасывайте состояние формы синхронно сразу после emit на
асинхронный обработчик родителя.** Перенесите reset в `watch`, привязанный к пропу `show`
диалога, и оборачивайте каждый обработчик родителя, который может запустить диалог, в
`try/catch`, направляющий сбои в видимое состояние ошибки.

## Почему это важно

12 апреля 2026 года поток создания контента в SPA для администрирования контента перестал
показывать ошибки. Редакторы жаловались, что диалог «Create» иногда мгновенно закрывается с
пустой формой, без подтверждения, что что-то сохранилось, и без ошибки, объясняющей, что
пошло не так.

Первопричина была в `CreateContentDialog`:

```ts
// Simplified reproduction of the 2026-04-12 state.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // ← runs before the parent's async handler does anything meaningful
};
```

И в родительском представлении:

```ts
// Parent handler — async, no try/catch.
const handleCreate = async (data: ContentData): Promise<void> => {
  await contentService.create(data); // throws if the service worker returns an error
  show.value = false;
};
```

Порядок выполнения:

1. `emit('create', formData.value)` — `handleCreate` родителя вызывается синхронно.
2. `handleCreate` в родителе вызывает `contentService.create(data)`, который возвращает
   `Promise` и приостанавливается на первом `await`.
3. Управление возвращается ребёнку. `reset()` выполняется немедленно, очищая форму.
4. `Promise` родителя разрешается или отклоняется. Если отклоняется:
   - На `Promise`, который вернул `handleCreate`, нет `.catch`.
   - В родителе нет `try/catch` вокруг вызова.
   - Rejection становится необработанным отклонением промиса.
   - В UI ничего не меняется — диалог мог закрыться, а мог и нет, форма пустая,
     ошибка пропала.

У редактора не было способа узнать, сохранился контент или нет. Чтобы отладить это,
приходилось вешать `window.addEventListener('unhandledrejection', ...)` в консоли браузера
просто ради того, чтобы увидеть класс ошибки, который дальше указал на
[границу structured-clone в IDB](/kb/platform/idb-structured-clone-boundary) внутри той же
фичи.

## Как применять

### Перенесите reset в watcher видимости

Привяжите `reset()` к событию, которое действительно сигнализирует о завершении: к скрытию
диалога. Оно срабатывает только после того, как родитель закончил асинхронную работу и
выставил `show = false`.

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

Это гарантирует три вещи:

1. Данные формы остаются на месте, пока работает обработчик родителя (полезно для
   повторных попыток).
2. Reset происходит не более одного раза на событие закрытия, сколько бы раз пользователь
   ни нажал кнопку отправки.
3. Если родитель оставляет диалог открытым, чтобы показать встроенную ошибку, данные формы
   сохраняются.

### Оборачивайте каждый обработчик родителя в try/catch

`async`-обработчик, вызванный через `emit` ребёнка, ребёнок никогда не дожидается, а
`Promise`, который тот возвращает, оттуда не виден. Если он отклоняется, rejection никто не
ловит, пока родитель не сделает это явно.

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

Отрисуйте `error` в шаблоне родителя или передайте его в диалог как проп, чтобы
пользователь видел сбой, не теряя состояние формы.

### Полная исправленная пара диалог + родитель

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

### Отладка необработанных rejection

Когда разбираетесь с симптомом «пустая форма, ошибки нет», добавьте это в начале сессии
разработки:

```ts
// Temporary diagnostic — paste into the browser console.
window.addEventListener('unhandledrejection', (ev) => {
  console.error('Unhandled rejection:', ev.reason);
});
```

Необработанный rejection здесь почти всегда означает, что у асинхронного обработчика,
вызванного через `emit`, нет `try/catch`. Перепроверьте через инспектор компонентов Vue
devtools, действительно ли выставляется `error`.

## Антипаттерны

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

Каждый из этих вариантов приводит к одному и тому же видимому пользователю симптому: диалог
закрывается или очищается, сообщение об ошибке не появляется, операция могла пройти, а
могла и нет, и пользователь повторяет вслепую.

## Как контролировать

Это проверка на код-ревью, а не правило линтера:

1. Любой компонент, который генерирует событие и тут же вызывает `reset()` или сбрасывает
   реактивное состояние в той же синхронной функции, — кандидат на этот баг.
2. Любой `async`-обработчик родителя, зарегистрированный через `@create` / `@submit` /
   `@confirm`, у которого нет `try/catch`, нужно отметить и исправить.
3. Проверьте, что `show.value = false` (или эквивалентная логика закрытия диалога) находится
   внутри блока `try`, а не после него — закрытие при ошибке выбрасывает ввод пользователя.

## Смотрите также

Необработанный rejection, который порождает этот паттерн, — один из случаев
[никогда не глотайте ошибки](/kb/error-handling/never-swallow-errors): `Promise`, который
вернул асинхронный обработчик `emit`, неявно теряется — это вариант `void asyncFn()` для
проглоченной ошибки. Проблема с structured-clone в IDB, найденная в той же сессии отладки,
разобрана в [границе structured-clone в IDB](/kb/platform/idb-structured-clone-boundary).
