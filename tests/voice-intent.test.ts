import { describe, it, expect } from 'vitest';
import { mapTranscriptToIntent } from '../server/voice-intent';

describe('mapTranscriptToIntent', () => {
  it('maps core command words', () => {
    expect(mapTranscriptToIntent('left')).toBe('MOVE_LEFT');
    expect(mapTranscriptToIntent('right')).toBe('MOVE_RIGHT');
    expect(mapTranscriptToIntent('boost')).toBe('BOOST');
    expect(mapTranscriptToIntent('brake')).toBe('BRAKE');
  });
  it('maps multi-word and synonym phrases', () => {
    expect(mapTranscriptToIntent('use power')).toBe('USE_POWER');
    expect(mapTranscriptToIntent('go left')).toBe('MOVE_LEFT');
    expect(mapTranscriptToIntent('turn right')).toBe('MOVE_RIGHT');
    expect(mapTranscriptToIntent('power')).toBe('USE_POWER');
    expect(mapTranscriptToIntent('slow down')).toBe('BRAKE');
    expect(mapTranscriptToIntent('go')).toBe('BOOST');
  });
  it('is case- and punctuation-insensitive', () => {
    expect(mapTranscriptToIntent('LEFT!')).toBe('MOVE_LEFT');
    expect(mapTranscriptToIntent('  Right. ')).toBe('MOVE_RIGHT');
  });
  it('finds a command word inside a longer interim transcript', () => {
    expect(mapTranscriptToIntent('uh go left now')).toBe('MOVE_LEFT');
  });
  it('returns null for unrecognized speech', () => {
    expect(mapTranscriptToIntent('hello there')).toBeNull();
    expect(mapTranscriptToIntent('')).toBeNull();
  });
  it('prioritizes the last directional word in a phrase', () => {
    // "left ... no right" — caller corrected themselves; take the latest
    expect(mapTranscriptToIntent('left no right')).toBe('MOVE_RIGHT');
  });
});
