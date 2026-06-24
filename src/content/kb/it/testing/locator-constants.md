---
title: 'Costanti dei locator vicine al componente'
category: testing
summary: 'I locator E2E vivono in un file di costanti accanto al componente e vengono richiamati sia nel markup del componente sia nei test, mai come stringhe letterali duplicate.'
principle: 'I locator E2E vivono in un file di costanti accanto al componente e vengono richiamati sia nel componente (come test id/attributi) sia nei test, mai come selettori a stringa duplicati.'
severity: strong
tags: [testing, playwright, e2e, locators, components]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-02
    note: 'Usa costanti collocate in un file separato accanto al componente; richiamale anche dal componente.'
related:
  - testing/aria-label-test-locator-hygiene
  - web-components/lit-functional-core
order: 3
updated: 2026-06-02
---

Una stringa `data-testid="toc-toggle"` in un componente e la stessa stringa
copiata in un test sono due fatti indipendenti che fingono di descrivere una cosa sola.
Cambia il test id nel componente e si sposta solo una delle due stringhe. Se sei
fortunato il test si rompe a runtime; se non lo sei, nessuno tocca il componente e la
discrepanza resta lì inosservata. Te ne accorgi in CI, non nell'editor.

La correzione è meccanica. Metti la stringa una volta sola, in un file di costanti accanto
al componente, e fai in modo che sia il componente sia il test la importino. Ora non può
più divergere.

## Perché conta

Lo standard ingegneristico (2026-06-02) lo dice chiaro: tieni le costanti in un file
separato accanto al componente e richiamale anche dal componente.

Questo blog lo applica su tutto il suo strato di web component. I componenti
`toc-drawer` e `kb-filter` portano ciascuno un fratello `.locators.ts`:

```
src/components/islands/
  toc-drawer.ts              ← component
  toc-drawer.locators.ts     ← constants exported as const
  toc-drawer.styles.ts
  kb-filter.ts
  kb-filter.locators.ts
```

`toc-drawer.locators.ts` esporta:

```ts
export const TOC_DRAWER = {
  tag: 'toc-drawer',
  toggle: 'toc-toggle',
  panel: 'toc-panel',
  close: 'toc-close',
  backdrop: 'toc-backdrop',
} as const;
```

`kb-filter.locators.ts` esporta:

```ts
export const KB_FILTER = {
  tag: 'kb-filter',
  input: 'kb-filter-input',
  count: 'kb-filter-count',
  empty: 'kb-filter-empty',
  chip: 'kb-filter-chip',
  chipTag: 'data-tag',
  item: 'data-kb-item',
  haystack: 'data-haystack',
  itemTags: 'data-tags',
} as const;
```

Il componente `toc-drawer.ts` importa dal suo fratello e scrive `TOC_DRAWER.tag`
come nome del custom element e `TOC_DRAWER.toggle` dentro `data-testid`. Il test fa
lo stesso import e chiama `page.getByTestId(TOC_DRAWER.toggle)`. Cambia la costante e
TypeScript segnala ogni riferimento nella stessa passata di compilazione.

## Come applicarlo

**1. Crea `<name>.locators.ts` accanto al componente.**

```ts
// src/components/notifications/notifications-badge.locators.ts
export const NOTIFICATIONS_BADGE = {
  tag: 'notifications-badge',
  indicator: 'notifications-badge-indicator',
  count: 'notifications-badge-count',
} as const;
```

Usa `as const` così i valori si restringono ai loro tipi letterali. Chi li usa può poi
destrutturare o indicizzare senza perdere la stringa letterale.

**2. Importa le costanti nel componente e usale nel template.**

```ts
// src/components/notifications/notifications-badge.ts
import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { NOTIFICATIONS_BADGE } from './notifications-badge.locators';

@customElement(NOTIFICATIONS_BADGE.tag)
export class NotificationsBadge extends LitElement {
  @state() private count = 0;

  protected override render(): unknown {
    return html`
      <button
        type="button"
        data-testid=${NOTIFICATIONS_BADGE.indicator}
        aria-label="Notifications: ${this.count} unread"
      >
        <span data-testid=${NOTIFICATIONS_BADGE.count}>${this.count}</span>
      </button>
    `;
  }
}
```

**3. Importa le stesse costanti nel test E2E.**

```ts
// e2e/notifications.spec.ts
import { test, expect } from '@playwright/test';
import { NOTIFICATIONS_BADGE } from '../src/components/notifications/notifications-badge.locators';

test('shows unread count', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.indicator),
  ).toBeVisible();
  await expect(
    page.getByTestId(NOTIFICATIONS_BADGE.count),
  ).toHaveText('3');
});
```

Il test non contiene mai la stringa `'notifications-badge-indicator'` come letterale.
Solo il file delle costanti la contiene. Rinominare l'id è una modifica a un singolo
file, e il compilatore TypeScript la propaga e la verifica su tutto il progetto.

## Anti-pattern

```ts
// ❌ Duplicated string literals — the component and the test are now out of sync
//    the moment either changes independently.

// In the component:
html`<button data-testid="notif-indicator">`;

// In the test:
page.getByTestId('notif-indicator'); // copied from memory — will drift

// ❌ Inline attribute strings with no shared source of truth
page.locator('[data-testid="kb-filter-input"]'); // bypasses the constant entirely

// ❌ Constants file placed far from the component — in a shared/test-ids.ts or similar.
//    This breaks colocation. When a component moves, the constants do not follow.
//    When a component is deleted, orphan constants accumulate.

// ❌ Relying on role + text selectors for everything when a stable test id would
//    be more precise.  Role locators are excellent for accessibility assertions but
//    fragile as primary navigation anchors — the accessible name is user-visible copy
//    that gets translated, revised, and A/B-tested.  See
//    testing/aria-label-test-locator-hygiene for when aria-label matching is fine and
//    when it is a trap.
```

Le costanti mancanti si presentano come fallimenti dei test che sembrano errori di
battitura. Il locator trova zero elementi, l'asserzione fallisce e la causa è una stringa
cambiata in un punto e non nell'altro. Niente emerge prima del runtime, e il diff non ti
dice nulla.

## Applicazione

Il compilatore TypeScript fa quasi tutto il lavoro di controllo. Con la costante tipizzata
`as const`, un riferimento a una chiave che non esiste (`NOTIFICATIONS_BADGE.indicatr`) è
un errore di compilazione e non una sorpresa a runtime. Il pattern tiene anche piccola la
superficie di ricerca: `grep -r 'data-testid=' src/` dovrebbe colpire solo i file dei
componenti, mai quelli dei test.

In revisione del codice, verifica:

- Ogni valore `data-testid` in un template di componente proviene da un import di costante.
- Il file `.locators.ts` corrispondente sta nella stessa directory del componente.
- I test importano le costanti dei locator; non contengono stringhe letterali per `data-testid`.
