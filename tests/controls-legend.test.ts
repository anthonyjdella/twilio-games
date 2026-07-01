// The controls legend is the players' one clear explanation of what every control does (shown in
// the lobby + the get-ready countdown). Lock in that it teaches ALL controls, both keyboard and
// voice, and — crucially — what POWER/NITRO is and how to refill it (the control players miss).
import { describe, it, expect } from 'vitest';
import { controlsLegendHtml } from '../client/controls-legend';

describe('controlsLegendHtml', () => {
  for (const variant of ['panel', 'card'] as const) {
    it(`(${variant}) shows every control with both keyboard glyph and voice word`, () => {
      const h = controlsLegendHtml(variant);
      // lane / boost / brake, keyboard + voice
      expect(h).toContain('←');
      expect(h).toContain('"left"');
      expect(h).toContain('boost');
      expect(h).toContain('brake');
      expect(h).toContain('Space');
    });

    it(`(${variant}) explains POWER: what it is (nitro) and how to refill (pads)`, () => {
      const h = controlsLegendHtml(variant).toLowerCase();
      expect(h).toContain('power');
      expect(h).toContain('nitro');
      expect(h).toContain('pad');       // "grab glowing pads to refill"
      expect(h).toMatch(/one charge|refill/);
    });

    it(`(${variant}) tags its wrapper so the two surfaces can be skinned differently`, () => {
      expect(controlsLegendHtml(variant)).toContain(`cl-${variant}`);
    });
  }
});
