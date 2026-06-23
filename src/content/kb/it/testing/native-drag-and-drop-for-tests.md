---
title: 'Usa il DnD nativo HTML5 così i test possono pilotarlo'
category: testing
summary: 'Le librerie di DnD sintetiche/pragmatiche non possono essere pilotate da Playwright; il DnD nativo HTML5 scritto a mano funziona per gli utenti e per il dispatch sintetico, e porta con sé un fallback da tastiera.'
principle: 'Le librerie di drag-and-drop pragmatiche/sintetiche non possono essere pilotate da Playwright (gli eventi sintetici non attivano il loro monitor di DnD nativo); il DnD nativo HTML5 scritto a mano funziona sia per gli utenti SIA per il dispatch sintetico.'
severity: context
tags: [testing, playwright, drag-and-drop, accessibility, e2e]
sources:
  - project: 'una app client per Jira'
    date: 2026-06-08
    note: 'Pragmatic DnD non pilotabile da Playwright; sostituito @atlaskit/pragmatic-drag-and-drop con DnD nativo HTML5 scritto a mano e fallback da tastiera Alt+↑/↓.'
related:
  - testing/event-driven-no-timeouts
  - testing/no-retries-no-flakes
order: 6
updated: 2026-06-08
---

Con il drag-and-drop, la libreria che scegli decide se la funzionalità sia testabile o no.
`@atlaskit/pragmatic-drag-and-drop` e librerie simili eseguono un monitor di drag custom
sopra l'API di DnD nativa, e quel monitor non reagisce mai agli eventi sintetici
`dragstart`, `dragover` e `drop` di Playwright. Scatta solo quando il browser emette
eventi pointer reali a partire da un gesto reale dell'utente. `page.dragAndDrop()` di
Playwright invia eventi sintetici, la libreria li ignora, il target del drop non riceve
nulla, e così la card non si sposta.

La soluzione è implementare il DnD usando l'API HTML5 DnD del browser stesso. Il DnD
nativo reagisce sia ai gesti reali dell'utente sia al dispatch sintetico di Playwright. Ti
costa all'incirca 150 righe di logica scritta a mano, e in cambio ottieni
un'implementazione testabile, accessibile, priva di una dipendenza in più e interamente
tua da modificare.

## Perché conta

In una app client per Jira (2026-06-08) la prima board Kanban era stata rilasciata con
`@atlaskit/pragmatic-drag-and-drop`. Quando abbiamo scritto i test E2E per lo spostamento
delle card, `page.dragAndDrop(source, target)` non faceva niente. Nel test la card non
cambiava mai colonna, anche se lo stesso gesto nel browser funzionava senza problemi. Il
monitor custom della libreria pragmatic non gestisce gli eventi sintetici.

Abbiamo scelto di sostituire la libreria invece di aggirarla, per tre motivi:

1. Una funzionalità che i test non possono pilotare non si può confermare funzionante in
   CI. La regola dei tre run (vedi [niente retry, niente flake](/principles/testing/no-retries-no-flakes))
   richiede una verifica deterministica; un'implementazione di DnD che funziona solo sotto
   un pointer reale non è verificabile.

2. Il fallback da tastiera (`Alt+↑` / `Alt+↓` per spostare una card su o giù dentro una
   colonna, `Alt+←` / `Alt+→` per spostarla tra colonne) serve agli utenti che usano solo
   la tastiera. La libreria non offriva alcun supporto da tastiera; il DnD nativo più un
   handler `keydown` copre entrambe le superfici nella stessa implementazione.

3. Eliminare la libreria ha eliminato una dipendenza esterna con il suo ciclo di
   aggiornamenti e il suo costo sul bundle.

La board è stata rilasciata con DnD nativo, update ottimistico, rollback in caso di errore
dell'API e il fallback da tastiera integrato come interazione di prima classe.

## Come applicarlo

**1. Marca gli elementi trascinabili con l'attributo `draggable` e collega gli eventi nativi.**

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

**2. Gestisci il drop sulla colonna, non su ogni card.**

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

**3. Aggiungi un fallback da tastiera usando `keydown`.**

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

Il percorso da tastiera esercita la stessa logica applicativa del percorso col pointer,
così una coppia di test copre entrambe le superfici:

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

**4. Usa un harness di test deterministico per il livello dell'API.**

La board usava `E2E_TEST_MODE` con un adapter Jira mock e un endpoint `/test/seed-session`
per seminare lo stato della board prima di ogni test. Questo elimina la dipendenza da
un'istanza Jira reale e mantiene i test indipendenti dallo stato esterno.

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

## Anti-pattern

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

Il vincolo che sta sotto a tutto questo è che il DnD vero ha bisogno di eventi trusted,
generati dal browser in risposta a un gesto reale del pointer. Le librerie che si
agganciano a questa pipeline (pragmatic-dnd, il monitor di react-beautiful-dnd, il livello
sensor di dnd-kit) ereditano il vincolo e diventano non testabili sotto il dispatch
sintetico di Playwright. Il DnD nativo HTML5 lo evita, perché `draggable`, `dragstart`,
`dragover` e `drop` sono eventi DOM standard che Playwright emette come eventi trusted
tramite `page.dragAndDrop`.

## Vedi anche

L'harness deterministico (`E2E_TEST_MODE`, stato seminato, adapter mock) poggia sullo
stesso principio delle strategie di attesa in
[attese event-driven](/principles/testing/event-driven-no-timeouts): un test non deve dipendere
dal timing, da servizi esterni o da qualsiasi altro input non deterministico. Il fallback
da tastiera della board è stato aggiunto per accessibilità, e fa anche da secondo vettore
di test a costo zero.
