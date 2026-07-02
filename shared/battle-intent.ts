// Map a caller's spoken utterance to one of the active monster's 4 move slots. Players SHOUT the
// move name ("Ember!", "Thunder Jolt"); a number ("two", "move 3", "the second one") is the fallback.
// Pure + shared by the CR voice adapter and any client. Priority: explicit NUMBER → name match.
// (Mirrors the racer's number/fuzzy approach but self-contained in shared/ so both layers use it.)

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4,
};
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4,
};

/** Parse a 1-based move NUMBER (1–4) from a phrase, or null. Digits (+ "3rd") → ordinal words →
 *  cardinal words. Ordinals beat cardinals so "the second one" is 2, not the trailing "one". */
export function parseMoveNumber(spoken: string): number | null {
  const q = spoken.toLowerCase();
  const digit = q.match(/\b([1-9])(?:st|nd|rd|th)?\b/);
  if (digit) return parseInt(digit[1]!, 10);
  for (const [w, n] of Object.entries(ORDINAL_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  return null;
}

/** Fuzzy-match a spoken phrase to a move NAME: exact → substring (either way) → shared significant
 *  word. Returns the index or -1. */
function fuzzyName(spoken: string, names: string[]): number {
  const q = spoken.toLowerCase().trim();
  if (!q) return -1;
  let idx = names.findIndex(n => n.toLowerCase() === q);
  if (idx >= 0) return idx;
  idx = names.findIndex(n => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()));
  if (idx >= 0) return idx;
  // shared significant word (>2 chars) — e.g. "jolt" → "Thunder Jolt", "zap them" → "Static Zap"
  const qWords = new Set(q.split(/\s+/).filter(w => w.length > 2));
  return names.findIndex(n => n.toLowerCase().split(/\s+/).some(w => qWords.has(w)));
}

/** Match a spoken utterance to a move index (0-based) among `names` (the active monster's 4 move
 *  names, in slot order), or -1 if nothing matches. NUMBER wins over an incidental name word. */
export function matchMove(spoken: string, names: string[]): number {
  const num = parseMoveNumber(spoken);
  if (num !== null) return (num >= 1 && num <= names.length) ? num - 1 : -1;
  return fuzzyName(spoken, names);
}
