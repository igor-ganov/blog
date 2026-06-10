import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { coerceTheme } from '@/lib/theme/coerce-theme';
import { nextTheme } from '@/lib/theme/next-theme';
import { themePresentation } from '@/lib/theme/theme-presentation';
import type { Theme } from '@/lib/theme/theme-types';
import { THEME_TOGGLE } from './theme-toggle.locators';
import { themeToggleStyles } from './theme-toggle.styles';

@customElement(THEME_TOGGLE.tag)
export class ThemeToggle extends LitElement {
  static override styles = themeToggleStyles;

  @state() private theme: Theme = 'light';

  override connectedCallback(): void {
    super.connectedCallback();
    this.theme = coerceTheme(document.documentElement.dataset.theme);
  }

  private readonly apply = (): void => {
    const value = nextTheme(this.theme);
    document.documentElement.dataset.theme = value;
    globalThis.localStorage.setItem('theme', value);
    this.theme = value;
  };

  protected override render(): unknown {
    const view = themePresentation(this.theme);
    return html`<button
      type="button"
      part="button"
      data-testid=${THEME_TOGGLE.button}
      aria-label=${view.label}
      title=${view.label}
      @click=${this.apply}
    >
      <span aria-hidden="true">${view.glyph}</span>
    </button>`;
  }
}
