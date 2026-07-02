// The pure half of "load a real sprite": given a monster id + view, what URLs do we try, in order?
// GIF is preferred over PNG so an animated sprite wins when both exist for the same monster; the
// renderer walks this list and falls back to the procedural placeholder only if every URL 404s.
import { describe, it, expect } from 'vitest';
import { spriteCandidateUrls } from '../client/battle/sprite-sources';

describe('spriteCandidateUrls', () => {
  it('tries GIF before PNG (animated wins when both exist)', () => {
    expect(spriteCandidateUrls('embertail', 'front')).toEqual([
      '/assets/monsters/embertail_front.gif',
      '/assets/monsters/embertail_front.png',
    ]);
  });

  it('builds the back view path too', () => {
    expect(spriteCandidateUrls('gustwing', 'back')).toEqual([
      '/assets/monsters/gustwing_back.gif',
      '/assets/monsters/gustwing_back.png',
    ]);
  });
});
