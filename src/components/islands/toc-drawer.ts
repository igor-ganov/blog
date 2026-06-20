import { html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { trapIndex } from '@/lib/focus/trap-index';
import { TOC_DRAWER } from './toc-drawer.locators';
import { tocDrawerStyles } from './toc-drawer.styles';

interface Heading {
  readonly id: string;
  readonly text: string;
}

// The article table of contents. On desktop it renders as an inline sticky block;
// under 60rem it collapses to a floating button that opens an off-canvas drawer
// (focus-trapped, Escape/backdrop dismissible, scroll-locked) — the same pattern
// the public marketing site uses for its side menu.
@customElement(TOC_DRAWER.tag)
export class TocDrawer extends LitElement {
  static override styles = tocDrawerStyles;

  // JSON array of { id, text } passed from the page (Lit parses the attribute).
  @property({ type: Array }) headings: readonly Heading[] = [];

  // Localized labels with English defaults.
  @property({ type: String }) heading = 'On this page';
  @property({ type: String }) closeLabel = 'Close contents';

  @state() private open = false;
  @state() private isMobile = false;

  @query('.panel') private readonly panel?: HTMLElement;
  @query('.close') private readonly closeButton?: HTMLElement;
  @query('.toggle') private readonly toggleButton?: HTMLElement;

  private readonly mq = globalThis.matchMedia('(max-width: 60rem)');

  override connectedCallback(): void {
    super.connectedCallback();
    this.isMobile = this.mq.matches;
    this.mq.addEventListener('change', this.onViewportChange);
    this.addEventListener('keydown', this.onKeydown);
  }

  override disconnectedCallback(): void {
    this.mq.removeEventListener('change', this.onViewportChange);
    this.removeEventListener('keydown', this.onKeydown);
    this.lockScroll(false);
    super.disconnectedCallback();
  }

  private readonly onViewportChange = (event: MediaQueryListEvent): void => {
    this.isMobile = event.matches;
    event.matches || this.close();
  };

  private readonly lockScroll = (locked: boolean): void => {
    document.body.style.overflow = locked ? 'hidden' : '';
  };

  private readonly openDrawer = (): void => {
    this.open = true;
    this.lockScroll(true);
    // The panel reveals from visibility:hidden; reading layout forces the style
    // recalc so the close button is focusable in the same task, then focus it.
    this.updateComplete.then(() => {
      const button = this.closeButton;
      button?.getBoundingClientRect();
      button?.focus();
    });
  };

  private readonly close = (): void => {
    this.open = false;
    this.lockScroll(false);
    this.updateComplete.then(() => this.toggleButton?.focus());
  };

  private readonly toggle = (): void => {
    this.open ? this.close() : this.openDrawer();
  };

  private readonly onLinkClick = (): void => {
    this.close();
  };

  private readonly focusables = (): readonly HTMLElement[] => [
    ...(this.panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []),
  ];

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (this.open === false) return;
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const list = this.focusables();
    if (list.length === 0) return;
    const current = list.indexOf(this.shadowRoot?.activeElement as HTMLElement);
    const target = list[trapIndex(Math.max(current, 0), list.length, event.shiftKey)];
    event.preventDefault();
    target?.focus();
  };

  protected override render(): unknown {
    const dialog = this.isMobile === true;
    return html`
      <button
        class="toggle"
        type="button"
        data-testid=${TOC_DRAWER.toggle}
        aria-haspopup="dialog"
        aria-expanded=${this.open}
        aria-controls=${TOC_DRAWER.panel}
        @click=${this.toggle}
      >
        <span class="toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2 4h12M2 8h12M2 12h8" />
          </svg>
        </span>
        ${this.heading}
      </button>

      <div
        class="backdrop"
        data-testid=${TOC_DRAWER.backdrop}
        ?data-open=${this.open}
        @click=${this.close}
      ></div>

      <nav
        id=${TOC_DRAWER.panel}
        class="panel"
        part="panel"
        data-testid=${TOC_DRAWER.panel}
        aria-label=${this.heading}
        role=${dialog ? 'dialog' : nothing}
        aria-modal=${dialog && this.open ? 'true' : nothing}
        ?data-open=${this.open}
      >
        <div class="panel-head">
          <span class="label">${this.heading}</span>
          <button
            class="close"
            type="button"
            data-testid=${TOC_DRAWER.close}
            aria-label=${this.closeLabel}
            @click=${this.close}
          >
            ✕
          </button>
        </div>
        <h2 class="label-desktop">${this.heading}</h2>
        <ul class="toc-list">
          ${this.headings.map(
            (heading) => html`<li>
              <a href="#${heading.id}" @click=${this.onLinkClick}>${heading.text}</a>
            </li>`,
          )}
        </ul>
      </nav>
    `;
  }
}
