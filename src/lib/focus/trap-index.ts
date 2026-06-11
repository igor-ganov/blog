// Next focus index when cycling a focus trap with Tab / Shift+Tab. Wraps at both
// ends. Direction is chosen by a lookup keyed on the boolean, not a branch.
const STEP = { true: -1, false: 1 } as const;

export const trapIndex = (current: number, count: number, backward: boolean): number =>
  (current + STEP[`${backward}`] + count) % count;
