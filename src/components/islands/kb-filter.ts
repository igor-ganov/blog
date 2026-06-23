import { matchTokens } from '@/lib/search/match-tokens';
import { matchesTags } from '@/lib/tags/matches-tags';
import { toggleTag } from '@/lib/tags/toggle-tag';
import { KB_FILTER } from './kb-filter.locators';

// Progressive enhancement for the practices filter. The controls (search box, tag
// chips, live count, empty message) and the cards are all server-rendered; this
// element only wires behaviour onto the existing light DOM. Nothing is created on
// hydration, so the server HTML and the hydrated DOM are identical — no reflow.
class KbFilter extends HTMLElement {
  #active: readonly string[] = [];

  connectedCallback(): void {
    this.#input()?.addEventListener('input', this.#apply);
    for (const chip of this.#chips()) {
      chip.addEventListener('click', () => this.#toggleChip(chip));
    }
    this.#apply();
  }

  #input = (): HTMLInputElement | undefined =>
    this.querySelector<HTMLInputElement>(`[data-testid="${KB_FILTER.input}"]`) ?? undefined;

  #chips = (): readonly HTMLButtonElement[] => [
    ...this.querySelectorAll<HTMLButtonElement>(`[data-testid="${KB_FILTER.chip}"]`),
  ];

  #items = (): readonly HTMLElement[] => [
    ...this.querySelectorAll<HTMLElement>(`[${KB_FILTER.item}]`),
  ];

  #itemTags = (el: HTMLElement): readonly string[] =>
    (el.getAttribute(KB_FILTER.itemTags) ?? '').split(',').filter(Boolean);

  #toggleChip = (chip: HTMLButtonElement): void => {
    const tag = chip.getAttribute(KB_FILTER.chipTag) ?? '';
    this.#active = toggleTag(this.#active, tag);
    chip.setAttribute('aria-pressed', String(this.#active.includes(tag)));
    this.#apply();
  };

  #apply = (): void => {
    const query = this.#input()?.value ?? '';
    const items = this.#items();
    let visible = 0;
    for (const el of items) {
      const ok =
        matchTokens(query, el.getAttribute(KB_FILTER.haystack) ?? '') &&
        matchesTags(this.#active, this.#itemTags(el));
      el.hidden = !ok;
      if (ok) visible += 1;
    }

    const count = this.querySelector(`[data-testid="${KB_FILTER.count}"]`);
    if (count) count.textContent = `${visible} / ${items.length}`;

    const empty = this.querySelector<HTMLElement>(`[data-testid="${KB_FILTER.empty}"]`);
    if (empty) empty.hidden = visible !== 0;
  };
}

if (!customElements.get(KB_FILTER.tag)) {
  customElements.define(KB_FILTER.tag, KbFilter);
}
