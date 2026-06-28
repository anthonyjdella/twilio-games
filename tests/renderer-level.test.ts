// tests/renderer-level.test.ts
// Renderer needs a DOM/WebGL context; in the node test env we only verify the PURE gate logic
// that decides whether zones cycle. Extract that decision into a tiny pure helper and test it.
import { describe, it, expect } from 'vitest';
import { shouldCycleZones } from '../client/zone-gate';
import { levelDefaults, resolveCarScale } from '../shared/level';

describe('shouldCycleZones', () => {
  it('cycles when no per-level lighting is locked', () => {
    expect(shouldCycleZones(false)).toBe(true);
  });
  it('does NOT cycle when a level locked its own lighting', () => {
    expect(shouldCycleZones(true)).toBe(false);
  });
});

describe('renderer car scale (index-string contract)', () => {
  // The game's setCarScale callback is (i) => resolveCarScale(level, String(i)); car overrides
  // are keyed by the per-car INDEX STRING ("0","1",…), the SAME key the editor (Task 5) writes.
  it('keys car overrides by index string', () => {
    const l = levelDefaults('m', 'm.glb');
    l.cars.masterScale = 1.5;
    l.cars.overrides['2'] = 2;
    expect(resolveCarScale(l, '2')).toBe(3);     // master 1.5 × override 2
    expect(resolveCarScale(l, '0')).toBe(1.5);   // master only (no override)
  });
});
