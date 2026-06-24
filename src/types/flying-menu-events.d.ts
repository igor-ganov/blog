// The flying menu dispatches these on document; type them so listeners can read the
// detail without casting. Mirrors the @fires tags in @igor-ganov/flying-menu.
declare global {
  type FlyingMenuCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  interface DocumentEventMap {
    'flying-menu-corner': CustomEvent<{ corner: FlyingMenuCorner }>;
    'flying-menu-toggle': CustomEvent<{ open: boolean }>;
  }
}

export {};
