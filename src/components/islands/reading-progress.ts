import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { scrollPercent } from '@/lib/scroll/scroll-percent';

// A thin top-of-page reading indicator. Listens passively to scroll/resize
// and reflects the percentage as a width — no layout thrash, no timers.
@customElement('reading-progress')
export class ReadingProgress extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0 0 auto 0;
      height: 3px;
      z-index: 50;
      pointer-events: none;
    }
    .bar {
      height: 100%;
      width: 0;
      background: var(--accent);
      transition: width 0.08s linear;
    }
  `;

  @state() private percent = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    globalThis.addEventListener('scroll', this.measure, { passive: true });
    globalThis.addEventListener('resize', this.measure, { passive: true });
    this.measure();
  }

  override disconnectedCallback(): void {
    globalThis.removeEventListener('scroll', this.measure);
    globalThis.removeEventListener('resize', this.measure);
    super.disconnectedCallback();
  }

  private readonly measure = (): void => {
    const doc = document.documentElement;
    this.percent = scrollPercent(doc.scrollTop, doc.scrollHeight - doc.clientHeight);
  };

  protected override render(): unknown {
    return html`<div class="bar" style="width:${this.percent}%"></div>`;
  }
}
