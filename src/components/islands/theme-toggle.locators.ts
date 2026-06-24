// Locator constants for the theme control. It is a server-rendered button enhanced
// in place (no custom element), so it is found by attribute rather than tag name.
export const THEME_TOGGLE = {
  attr: 'data-theme-toggle',
  button: 'theme-toggle-button',
} as const;
