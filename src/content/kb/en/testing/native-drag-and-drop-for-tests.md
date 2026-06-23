---
title: 'Use native HTML5 DnD so tests can drive it'
category: testing
summary: 'Synthetic/pragmatic DnD libraries cannot be driven by Playwright; hand-rolled native HTML5 DnD works for users and synthetic dispatch, and ships a keyboard fallback.'
principle: 'Pragmatic/synthetic drag-and-drop libraries cannot be driven by Playwright (synthetic events do not trigger their native-DnD monitor); hand-rolled native HTML5 DnD works for users AND synthetic dispatch.'
severity: context
tags: [testing, playwright, drag-and-drop, accessibility, e2e]
sources:
  - project: 'a Jira client app'
    date: 2026-06-08
    note: 'Pragmatic DnD undriveable by Playwright; replaced @atlaskit/pragmatic-drag-and-drop with hand-rolled native HTML5 DnD and keyboard Alt+↑/↓ fallback.'
related:
  - testing/event-driven-no-timeouts
  - testing/no-retries-no-flakes
order: 6
updated: 2026-06-08
---

With drag-and-drop, the library you pick decides whether the feature can be tested at all.
`@atlaskit/pragmatic-drag-and-drop` and similar libraries run a custom drag monitor on
top of the native DnD API, and that monitor never reacts to Playwright's synthetic
`dragstart`, `dragover`, and `drop` events. It only fires when the browser dispatches
real pointer events from a real user gesture. Playwright's `page.dragAndDrop()` sends
synthetic events, the library ignores them, and the drop target receives nothing, so the
card never moves.

The fix is to implement DnD against the browser's own HTML5 DnD API. Native DnD reacts to
real user gestures and to Playwright's synthetic dispatch alike. It costs you roughly 150
lines of hand-rolled logic, and in return you get an implementation that is testable,
accessible, free of an extra dependency, and entirely yours to change.

## Why this matters

On a Jira client app (2026-06-08) the first Kanban board shipped with
`@atlaskit/pragmatic-drag-and-drop`. When we wrote E2E tests for card movement,
`page.dragAndDrop(source, target)` did nothing. The card never changed column in the
test, even though the same gesture worked fine in the browser. The pragmatic library's
custom monitor does not handle synthetic events.

We chose to replace the library rather than work around it, for three reasons:

1. A feature that cannot be driven by tests cannot be confirmed working in CI. The
   three-run rule (see [no retries, no flakes](/principles/testing/no-retries-no-flakes))
   requires deterministic verification; a DnD implementation that only works under a
   real pointer is not verifiable.

2. The keyboard fallback (`Alt+↑` / `Alt+↓` to move a card up or down within a column,
   `Alt+←` / `Alt+→` to move between columns) is required for keyboard-only users. The
   library provided no keyboard support; native DnD plus a `keydown` handler covers
   both surfaces in the same implementation.

3. Dropping the library dropped an external dependency that carried its own update cycle
   and bundle cost.

The board shipped with native DnD, an optimistic update, rollback on API failure, and the
keyboard fallback built in as a first-class interaction.

## How to apply

**1. Mark draggable elements with the `draggable` attribute and wire the native events.**

```ts
// ❌ Library-based DnD — Playwright cannot drive this
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

connectedCallback(): void {
  this.cleanup = draggable({
    element: this,
    onDrop: ({ location }) => this.handleDrop(location),
  });
}

// ✅ Native HTML5 DnD — Playwright's page.dragAndDrop works
protected override render(): unknown {
  return html`
    <article
      draggable="true"
      data-testid=${BOARD.card(this.ticketId)}
      @dragstart=${this.onDragStart}
      @dragend=${this.onDragEnd}
    >
      ${this.ticketId}
    </article>
  `;
}

private readonly onDragStart = (e: DragEvent): void => {
  e.dataTransfer?.setData('text/plain', this.ticketId);
  e.dataTransfer?.setData('application/x-ticket-id', this.ticketId);
};
```

**2. Handle drop on the column, not on each card.**

```ts
// Column component wires dragover + drop at the container level
protected override render(): unknown {
  return html`
    <section
      data-testid=${BOARD.column(this.status)}
      @dragover=${this.onDragOver}
      @drop=${this.onDrop}
    >
      <slot></slot>
    </section>
  `;
}

private readonly onDragOver = (e: DragEvent): void => {
  e.preventDefault(); // required to allow drop
  e.dataTransfer!.dropEffect = 'move';
};

private readonly onDrop = async (e: DragEvent): Promise<void> => {
  e.preventDefault();
  const ticketId = e.dataTransfer?.getData('application/x-ticket-id');
  if (!ticketId) return;

  // Optimistic update — move the card immediately in local state
  this.dispatchEvent(
    new CustomEvent('ticket-move', {
      bubbles: true,
      detail: { ticketId, toStatus: this.status },
    }),
  );
};
```

**3. Add a keyboard fallback using `keydown`.**

```ts
// In the card component: Alt+↑/↓ within column, Alt+←/→ between columns
private readonly onKeyDown = (e: KeyboardEvent): void => {
  if (!e.altKey) return;
  const direction = KEY_TO_DIRECTION[e.key]; // ↑ ↓ ← →
  if (!direction) return;
  e.preventDefault();
  this.dispatchEvent(
    new CustomEvent('ticket-move-keyboard', {
      bubbles: true,
      detail: { ticketId: this.ticketId, direction },
    }),
  );
};
```

The keyboard path exercises the same application logic as the pointer path, so a pair of
tests covers both surfaces:

```ts
test('moves card to Done via drag', async ({ page }) => {
  await page.goto('/board');
  await page.dragAndDrop(
    page.getByTestId(BOARD.card('PROJ-1')),
    page.getByTestId(BOARD.column('Done')),
  );
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
  await expect(page.getByTestId(BOARD.column('In Progress'))).not.toContainText('PROJ-1');
});

test('moves card to Done via keyboard', async ({ page }) => {
  await page.goto('/board');
  await page.getByTestId(BOARD.card('PROJ-1')).focus();
  await page.keyboard.press('Alt+ArrowRight'); // In Progress → Done
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
});
```

**4. Use a deterministic test harness for the API layer.**

The board used `E2E_TEST_MODE` with a mock Jira adapter and a `/test/seed-session`
endpoint to seed board state before each test. That drops the dependency on a live Jira
instance and keeps the tests independent of external state.

```ts
// playwright.config.ts — sets E2E_TEST_MODE for the dev server
export default defineConfig({
  webServer: {
    command: 'E2E_TEST_MODE=1 bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});

// e2e/helpers/seed.ts
export const seedBoard = async (page: Page, tickets: Ticket[]): Promise<void> => {
  await page.request.post('/test/seed-session', { data: { tickets } });
};
```

## Anti-patterns

```ts
// ❌ Wrapping Playwright's mouse API to simulate drag manually.
//    This triggers mousemove/mousedown but not dragstart/dragover/drop;
//    the library monitor still does not see it.
await page.mouse.move(card.x, card.y);
await page.mouse.down();
await page.mouse.move(target.x, target.y, { steps: 10 });
await page.mouse.up();

// ❌ Injecting a script to fire synthetic DragEvent from inside the page.
//    Synthetic events from page.evaluate() are not trusted events; the browser
//    DnD pipeline ignores untrusted dragstart.
await page.evaluate(([src, tgt]) => {
  const evt = new DragEvent('dragstart', { bubbles: true });
  src.dispatchEvent(evt);
}, [sourceHandle, targetHandle]);

// ❌ Skipping the DnD test entirely because it's "hard to automate".
//    A feature that cannot be tested is a feature that cannot be confirmed working.
test.skip('moves card between columns', async () => { /* TODO */ });
```

The constraint underneath all of this is that real DnD needs trusted events, generated by
the browser in response to a real pointer gesture. Libraries that hook into this pipeline
(pragmatic-dnd, react-beautiful-dnd's monitor, dnd-kit's sensor layer) inherit the
constraint and become untestable under Playwright's synthetic dispatch. Native HTML5 DnD
avoids it, because `draggable`, `dragstart`, `dragover`, and `drop` are standard DOM
events that Playwright dispatches as trusted events through `page.dragAndDrop`.

## See also

The deterministic harness (`E2E_TEST_MODE`, seeded state, mock adapter) rests on the same
principle as the wait strategies in
[event-driven waits](/principles/testing/event-driven-no-timeouts): a test should not depend on
timing, external services, or any other non-deterministic input. The board's keyboard
fallback was added for accessibility, and it doubles as a second test vector at no extra
cost.
