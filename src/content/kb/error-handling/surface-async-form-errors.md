---
title: "Don't reset form state before the async handler resolves"
category: error-handling
summary: "Calling reset() synchronously after emit('create') discards the form before the parent's async handler runs, producing an unhandled rejection, a blank form, and no visible error."
principle: 'Never reset form state synchronously right after emitting to an async parent handler; move reset into a watcher tied to visibility, and always wrap the parent handler in try/catch that surfaces the error.'
severity: preferred
tags: [error-handling, forms, async, vue, ui]
sources:
  - project: 'a content-admin SPA'
    date: 2026-04-12
    note: 'synchronous reset before async parent → unhandled rejection, blank form, no error; move reset to watcher + try/catch'
related:
  - error-handling/never-swallow-errors
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-04-12
---

When a form dialog emits an event to trigger an async parent handler, there is a tempting
pattern: call `reset()` immediately after `emit(...)` so the form looks clean while the
parent does its work. The problem is ordering. `emit` is synchronous — it invokes the
parent's handler on the current call stack. If the parent handler is `async`, it returns
a `Promise` immediately. The child never sees that `Promise`, so it cannot await it.
`reset()` runs before the handler's first `await` has resolved. When the handler
subsequently throws — network error, validation failure, API rejection — the parent has
no catch clause, the rejection becomes unhandled, the form has already been blanked, and
the user sees neither the error nor the data they typed.

The rule: **never reset form state synchronously right after emitting to an async parent
handler.** Move the reset into a `watch` tied to the dialog's `show` prop. Wrap every
parent handler that the dialog can trigger in `try/catch` that routes failures to a
visible error state.

## Why this matters

On 2026-04-12 the content-creation flow on a content-admin SPA stopped surfacing
errors. Editors reported that the "Create" dialog would sometimes close instantly with a
blank form and no confirmation that the content had been saved — and no error to explain
what went wrong.

The root cause was in `CreateContentDialog`:

```ts
// Simplified reproduction of the 2026-04-12 state.
const handleCreate = (): void => {
  emit('create', formData.value);
  reset(); // ← runs before the parent's async handler does anything meaningful
};
```

And in the parent view:

```ts
// Parent handler — async, no try/catch.
const handleCreate = async (data: ContentData): Promise<void> => {
  await contentService.create(data); // throws if the service worker returns an error
  show.value = false;
};
```

Execution order:

1. `emit('create', formData.value)` — the parent's `handleCreate` is called synchronously.
2. `handleCreate` in the parent calls `contentService.create(data)`, which returns a
   `Promise` and suspends at the first `await`.
3. Control returns to the child. `reset()` executes immediately, blanking the form.
4. The parent's `Promise` resolves or rejects. If it rejects:
   - There is no `.catch` on the `Promise` returned by `handleCreate`.
   - There is no `try/catch` in the parent wrapping the call.
   - The rejection becomes an unhandled promise rejection.
   - Nothing in the UI changes — the dialog may or may not have closed, the form is
     blank, the error is gone.

The editor had no way to know whether the content was saved. Debugging required listening
to `window.addEventListener('unhandledrejection', ...)` in the browser console to even
see the error class, which in turn led to the underlying
[IDB structured-clone boundary](/kb/platform/idb-structured-clone-boundary) issue in the
same feature.

## How to apply

### Move reset into a visibility watcher

Tie `reset()` to the event that actually signals completion: the dialog becoming hidden.
That event only fires after the parent finishes its async work and sets `show = false`.

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

This guarantees three things:

1. The form data is still present while the parent handler is running (useful for
   retries).
2. The reset happens at most once per close event, regardless of how many times the user
   clicks the submit button.
3. If the parent keeps the dialog open to show an inline error, the form data survives.

### Wrap every parent handler in try/catch

An `async` handler that is invoked by a child `emit` call is never awaited by the child.
The `Promise` it returns is invisible to the child. If it rejects, nothing catches the
rejection unless the parent does so explicitly.

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

The `error` ref is rendered in the parent template (or passed as a prop to the dialog)
so the user sees the failure without losing their form state.

### Full corrected dialog + parent pair

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

### Debugging unhandled rejections

When investigating a "blank form, no error" symptom, add this early in the dev session:

```ts
// Temporary diagnostic — paste into the browser console.
window.addEventListener('unhandledrejection', (ev) => {
  console.error('Unhandled rejection:', ev.reason);
});
```

An unhandled rejection here almost always means an async handler invoked via `emit` has
no `try/catch`. Pair with the Vue devtools component inspector to confirm whether the
`error` ref is being set.

## Anti-patterns

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

Each of these produces the same user-visible symptom: the dialog closes (or blanks),
there is no error message, the operation may or may not have succeeded, and the user
retries in the dark.

## Enforcement

This is a code-review check, not a lint rule:

1. Any component that emits an event and immediately calls `reset()` or clears reactive
   state in the same synchronous function is a candidate for this bug.
2. Any `async` parent handler registered via `@create` / `@submit` / `@confirm` that has
   no `try/catch` must be flagged and fixed.
3. Check that `show.value = false` (or equivalent dialog-close logic) is inside the
   `try` block, not after it — closing on error discards the user's input.

## See also

The unhandled rejection this pattern produces is a specific instance of
[never swallow errors](/kb/error-handling/never-swallow-errors): the `Promise` returned
by an async `emit` handler is dropped implicitly, which is the `void asyncFn()` variant
of a swallowed error. The IDB structured-clone issue discovered in the same debugging
session is covered in [IDB structured-clone boundary](/kb/platform/idb-structured-clone-boundary).
