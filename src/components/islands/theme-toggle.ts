import { coerceThemePref } from '@/lib/theme/coerce-theme-pref';
import { nextThemePref } from '@/lib/theme/next-theme-pref';
import { resolveTheme } from '@/lib/theme/resolve-theme';
import type { ThemePref } from '@/lib/theme/theme-types';
import { THEME_TOGGLE } from './theme-toggle.locators';

// Progressive enhancer for the server-rendered theme button(s). It is NOT a custom
// element: the button paints with the document (no hydration reflow) and this script
// only wires behaviour — cycle light/dark/system, persist, and animate the swap as a
// circular reveal from the click point (the public marketing site's transition).

const root = document.documentElement;
const darkQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
const reduceQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

// Maps a preference to the button's localized state-name data attribute.
const nameKey: Record<ThemePref, 'nameLight' | 'nameDark' | 'nameSystem'> = {
  light: 'nameLight',
  dark: 'nameDark',
  system: 'nameSystem',
};

const buttons = (): readonly HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[${THEME_TOGGLE.attr}]`),
];

const currentPref = (): ThemePref => coerceThemePref(root.dataset.themePref);

const labelFor = (button: HTMLElement, pref: ThemePref): string => {
  const base = button.dataset.label ?? '';
  const name = button.dataset[nameKey[pref]] ?? pref;
  return `${base} (${name})`;
};

const syncButtons = (pref: ThemePref): void => {
  for (const button of buttons()) button.setAttribute('aria-label', labelFor(button, pref));
};

// Commit a preference: reflect it on <html>, repaint the theme, persist it, relabel.
const apply = (pref: ThemePref): void => {
  root.dataset.themePref = pref;
  root.dataset.theme = resolveTheme(pref, darkQuery.matches);
  globalThis.localStorage.setItem('theme', pref);
  syncButtons(pref);
};

const setOrigin = (event: MouseEvent): void => {
  const { clientX: x, clientY: y } = event;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.style.setProperty('--theme-x', `${x}px`);
  root.style.setProperty('--theme-y', `${y}px`);
  root.style.setProperty('--theme-r', `${radius}px`);
};

const canAnimate = (): boolean =>
  typeof document.startViewTransition === 'function' && !reduceQuery.matches;

const onClick = (event: MouseEvent): void => {
  const next = nextThemePref(currentPref());
  if (!canAnimate()) {
    apply(next);
    return;
  }
  setOrigin(event);
  document.startViewTransition({ update: () => apply(next), types: ['theme'] });
};

const bind = (): void => {
  for (const button of buttons()) {
    if (button.dataset.themeBound === 'true') continue;
    button.dataset.themeBound = 'true';
    button.addEventListener('click', onClick);
  }
  syncButtons(currentPref());
};

bind();
// View transitions swap the <body>; re-bind the buttons in the new document.
document.addEventListener('astro:after-swap', bind);
