// Whitespace-split AND match against arbitrary text. Empty query → true
// (reduce over no tokens yields the seed). Shared by the filter island and
// the article matcher so both behave identically.
export const matchTokens = (query: string, text: string): boolean => {
  const lowered = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((ok, token) => ok && lowered.includes(token), true);
};
