import { describe, it, expect } from 'vitest';
import { readGlb } from '../tools/glb-read';

describe('readGlb', () => {
  it('reads a plain box: one node, ~1×1×1', async () => {
    const r = await readGlb('assets/fixtures/box.glb');
    expect(r.nodeNames).toContain('Box');
    expect(r.size[0]).toBeCloseTo(1, 1);
    expect(r.size[1]).toBeCloseTo(1, 1);
    expect(r.size[2]).toBeCloseTo(1, 1);
  });
  it('reads a car with four named wheel nodes', async () => {
    const r = await readGlb('assets/fixtures/car4wheel.glb');
    const wheels = r.nodeNames.filter(n => /wheel/i.test(n));
    expect(wheels).toHaveLength(4);
    expect(r.size[2]).toBeGreaterThan(r.size[0]); // longer than wide (z is length)
  });
  it('reports animationNames (empty for the static fixtures)', async () => {
    const r = await readGlb('assets/fixtures/box.glb');
    expect(Array.isArray(r.animationNames)).toBe(true);
    expect(r.animationNames).toHaveLength(0);
  });
});
