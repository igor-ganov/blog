// Blog essays are shown newest-first. Ties on the same day fall back to the
// authored `order` so a day's posts have a stable sequence. Non-mutating.
interface SortablePost {
  readonly data: { readonly date: string; readonly order: number };
}

export const sortEssays = <T extends SortablePost>(posts: readonly T[]): readonly T[] =>
  [...posts].sort((a, b) => b.data.date.localeCompare(a.data.date) || a.data.order - b.data.order);
