import { html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { matchTokens } from '@/lib/search/match-tokens';
import { KB_FILTER } from './kb-filter.locators';
import { kbFilterStyles } from './kb-filter.styles';

// Filters its own light-DOM children (slotted cards) by data-haystack.
// The cards stay in the light DOM, so a plain querySelectorAll reaches them.
@customElement(KB_FILTER.tag)
export class KbFilter extends LitElement {
  static override styles = kbFilterStyles;

  @state() private query = '';
  @state() private visible = 1;
  @state() private total = 0;
  @query('input') private readonly input?: HTMLInputElement;

  protected override firstUpdated(): void {
    this.total = this.items().length;
    this.applyFilter();
  }

  private readonly items = (): readonly HTMLElement[] => [
    ...this.querySelectorAll<HTMLElement>(`[${KB_FILTER.item}]`),
  ];

  private readonly applyFilter = (): void => {
    const matches = this.items().filter((el) =>
      matchTokens(this.query, el.getAttribute(KB_FILTER.haystack) ?? ''),
    );
    for (const el of this.items()) {
      el.hidden = matches.includes(el) === false;
    }
    this.visible = matches.length;
  };

  private readonly onInput = (): void => {
    this.query = this.input?.value ?? '';
    this.applyFilter();
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
      <slot></slot>
      <p class="empty" data-testid=${KB_FILTER.empty} ?hidden=${this.visible !== 0}>
        No practices match your filter.
      </p>
    `;
  }
}
