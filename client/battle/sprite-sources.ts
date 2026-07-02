// Where the battle renderer looks for a monster's real art, and in what order. GIF is tried BEFORE
// PNG so an ANIMATED sprite wins whenever both files exist for the same monster+view; the renderer
// walks this list and only falls back to the procedural placeholder if every candidate 404s. Pure
// (no DOM) so the ordering is unit-testable; the actual loading lives in battle-renderer.ts.
export type SpriteView = 'front' | 'back';

/** Ordered list of URLs to try for `<id>`'s `<view>` sprite: animated GIF first, then static PNG. */
export function spriteCandidateUrls(id: string, view: SpriteView): string[] {
  const stem = `/assets/monsters/${id}_${view}`;
  return [`${stem}.gif`, `${stem}.png`];
}
