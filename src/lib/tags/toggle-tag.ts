// Toggle a tag in the active set without branching: Set.delete returns true when
// the tag was present (so it is now removed); only then is add() skipped.
export const toggleTag = (active: readonly string[], tag: string): readonly string[] => {
  const next = new Set(active);
  next.delete(tag) || next.add(tag);
  return [...next];
};
