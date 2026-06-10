// Reading progress as an integer 0–100, clamped. maxScroll guarded against 0.
export const scrollPercent = (scrollTop: number, maxScroll: number): number =>
  Math.min(100, Math.max(0, Math.round((scrollTop / Math.max(maxScroll, 1)) * 100)));
