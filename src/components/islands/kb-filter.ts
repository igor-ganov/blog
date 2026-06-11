import { html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { matchTokens } from '@/lib/search/match-tokens';
import { matchesTags } from '@/lib/tags/matches-tags';
import { toggleTag } from '@/lib/tags/toggle-tag';
import { KB_FILTER } from './kb-filter.locators';
import { kbFilterStyles } from './kb-filter.styles';

// Filters its own light-DOM children (slotted cards) by data-haystack text and
// by the active quick-filter tag chips. Cards stay in the light DOM, so a plain
// querySelectorAll reaches them.
@customElement(KB_FILTER.tag)
export class KbFilter extends LitElement {
  static override styles = kbFilterStyles;

  // Comma-separated tag names for the quick-filter chips, ordered by the page.
  @property({ type: String }) tags = '';

  @state() private query = '';
  @state() private active: readonly string[] = [];
  @state() private visible = 1;
  @state() private total = 0;
  @query('input') private readonly input?: HTMLInputElement;

  protected override firstUpdated(): void {
    this.total = this.items().length;
    this.applyFilter();
  }

  private readonly chips = (): readonly string[] => this.tags.split(',').filter(Boolean);

  private readonly items = (): readonly HTMLElement[] => [
    ...this.querySelectorAll<HTMLElement>(`[${KB_FILTER.item}]`),
  ];

  private readonly itemTags = (el: HTMLElement): readonly string[] =>
    (el.getAttribute(KB_FILTER.itemTags) ?? '').split(',').filter(Boolean);

  private readonly applyFilter = (): void => {
    const matches = this.items().filter(
      (el) =>
        matchTokens(this.query, el.getAttribute(KB_FILTER.haystack) ?? '') &&
        matchesTags(this.active, this.itemTags(el)),
    );
    for (const el of this.items()) el.hidden = matches.includes(el) === false;
    this.visible = matches.length;
  };

  private readonly onInput = (): void => {
    this.query = this.input?.value ?? '';
    this.applyFilter();
  };

  private readonly onChip = (tag: string) => (): void => {
    this.active = toggleTag(this.active, tag);
    this.applyFilter();
  };

  private readonly renderChips = (): unknown => {
    const chips = this.chips();
    return chips.length === 0
      ? nothing
      : html`<div class="chips" role="group" aria-label="Filter by tag">
          ${chips.map((tag) => {
            const pressed = this.active.includes(tag);
            // Attribute name is the literal KB_FILTER.chipTag ('data-tag').
            return html`<button
              type="button"
              class="chip"
              data-testid=${KB_FILTER.chip}
              data-tag=${tag}
              aria-pressed=${pressed}
              @click=${this.onChip(tag)}
            >
              ${tag}
            </button>`;
          })}
        </div>`;
  };

  protected override render(): unknown {
    return html`
      <div class="bar">
        <input
          type="search"
          inputmode="search"
          placeholder="Filter practices…"
          aria-label="Filter practices"
          data-testid=${KB_FILTER.input}
          @input=${this.onInput}
        />
        <p class="count" role="status" aria-live="polite" data-testid=${KB_FILTER.count}>
          ${this.visible} / ${this.total}
        </p>
      </div>
      ${this.renderChips()}
      <slot></slot>
      <p class="empty" data-testid=${KB_FILTER.empty} ?hidden=${this.visible !== 0}>
        No practices match your filter.
      </p>
    `;
  }
}
