// OR semantics across the active chips: an item matches when no chip is active,
// or it carries at least one of the active tags. Combined (AND) with the text
// query by the caller so the two facets narrow together.
export const matchesTags = (active: readonly string[], itemTags: readonly string[]): boolean =>
  active.length === 0 || active.some((tag) => itemTags.includes(tag));
