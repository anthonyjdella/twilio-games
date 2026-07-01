// The controls legend is the players' one clear explanation of how to drive — shown in the lobby.
// This game is VOICE-first (Twilio Conversation Relay), so the legend must teach SPOKEN commands and
// must NOT show any keyboard keys. It also must explain POWER/NITRO + how to refill (the missed move).
import { describe, it, expect } from 'vitest';
import { controlsLegendHtml } from '../client/controls-legend';

describe('controlsLegendHtml', () => {
  it('teaches the SPOKEN commands (lane / boost / brake)', () => {
    const h = controlsLegendHtml();
    expect(h).toContain('Left');
    expect(h).toContain('Right');
    expect(h).toContain('Boost');
    expect(h).toContain('Brake');
  });

  it('explains POWER: what it is (nitro) and how to refill (pads)', () => {
    const h = controlsLegendHtml().toLowerCase();
    expect(h).toContain('power');
    expect(h).toContain('nitro');
    expect(h).toContain('pad');
    expect(h).toMatch(/one charge|refill/);
  });

  it('shows NO keyboard keys anywhere (voice-first game)', () => {
    const h = controlsLegendHtml();
    // no arrow glyphs, no "Space", no keyboard-key chip class
    expect(h).not.toContain('←');
    expect(h).not.toContain('→');
    expect(h).not.toContain('↑');
    expect(h).not.toContain('↓');
    expect(h).not.toMatch(/\bSpace\b/);
    expect(h).not.toContain('cl-key');
  });

  it('frames it as talking, not typing', () => {
    expect(controlsLegendHtml().toLowerCase()).toMatch(/talk|shout|say/);
  });
});
