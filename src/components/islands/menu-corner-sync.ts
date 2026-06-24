// Keeps the TOC floating button clear of the flying menu. The menu is draggable and
// persists its resting corner; when it rests bottom-left it would sit on top of the
// TOC FAB (also bottom-left). We publish the lift as a CSS custom property on <html>
// that toc-drawer's `.toggle` reads, so the button rises above the menu trigger.

const STORAGE_KEY = 'ep-menu-corner';
const BASE = 'var(--space-5)';
// Clears the 3rem trigger plus its edge margin, with a little breathing room.
const RAISED = 'calc(var(--space-5) + 4rem)';

const root = document.documentElement;

const lift = (corner: FlyingMenuCorner): void => {
  root.style.setProperty('--toc-fab-bottom', corner === 'bottom-left' ? RAISED : BASE);
};

const knownCorners: Record<FlyingMenuCorner, true> = {
  'top-left': true,
  'top-right': true,
  'bottom-left': true,
  'bottom-right': true,
};

const isCorner = (value: string | undefined): value is FlyingMenuCorner =>
  value !== undefined && value in knownCorners;

const storedCorner = (): FlyingMenuCorner => {
  try {
    const value = globalThis.localStorage.getItem(STORAGE_KEY) ?? undefined;
    return isCorner(value) ? value : 'bottom-right';
  } catch {
    return 'bottom-right';
  }
};

lift(storedCorner());
document.addEventListener('flying-menu-corner', (event) => lift(event.detail.corner));
