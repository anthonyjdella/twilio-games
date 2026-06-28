// tests/renderer-level.test.ts
// Renderer needs a DOM/WebGL context; in the node test env we only verify the PURE gate logic
// that decides whether zones cycle. Extract that decision into a tiny pure helper and test it.
import { describe, it, expect } from 'vitest';
import { shouldCycleZones } from '../client/zone-gate';

describe('shouldCycleZones', () => {
  it('cycles when no per-level lighting is locked', () => {
    expect(shouldCycleZones(false)).toBe(true);
  });
  it('does NOT cycle when a level locked its own lighting', () => {
    expect(shouldCycleZones(true)).toBe(false);
  });
});
