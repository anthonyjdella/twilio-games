// The curved track must report PITCH (nose up/down) from the slope between per-point heights, so
// cars tip to follow hills instead of staying flat (wheels hovering/sinking). Pitch is derived from
// the tangent's vertical component; a flat track must report ~0 pitch (existing behavior preserved).
import { describe, it, expect } from 'vitest';
import { CurvedTrack } from '../client/track-path';
import { RACE_LEN } from '../shared/constants';

describe('CurvedTrack.sample pitch', () => {
  it('reports ~0 pitch on a flat track', () => {
    const t = new CurvedTrack({ points: [[0, 0], [0, RACE_LEN]] });
    const p = t.sample(RACE_LEN / 2, 0);
    expect(p.pitch ?? 0).toBeCloseTo(0, 3);
  });

  it('reports nose-UP pitch on an uphill segment', () => {
    // Track climbs +Y as it goes +Z: a 45° ramp. points are [x, y, z].
    const t = new CurvedTrack({ points: [[0, 0, 0], [0, RACE_LEN, RACE_LEN]] });
    const p = t.sample(RACE_LEN / 2, 0);
    // tangent ≈ (0, 1, 1) normalized → pitch = atan2(tan.y, horizontal) ≈ 45° = π/4.
    // Sign convention: nose-up. We assert magnitude ≈ π/4 and that it's positive (up).
    expect(Math.abs(p.pitch!)).toBeCloseTo(Math.PI / 4, 2);
    expect(p.pitch!).toBeGreaterThan(0);
  });

  it('reports nose-DOWN pitch on a downhill segment (opposite sign of uphill)', () => {
    const up = new CurvedTrack({ points: [[0, 0, 0], [0, RACE_LEN, RACE_LEN]] }).sample(RACE_LEN / 2, 0);
    const down = new CurvedTrack({ points: [[0, RACE_LEN, 0], [0, 0, RACE_LEN]] }).sample(RACE_LEN / 2, 0);
    expect(Math.sign(down.pitch!)).toBe(-Math.sign(up.pitch!));
    expect(Math.abs(down.pitch!)).toBeCloseTo(Math.PI / 4, 2);
  });

  it('still reports headingY (yaw) unchanged on a turning track', () => {
    // A track that bends toward +X should still yaw; pitch stays ~0 (no elevation change).
    const t = new CurvedTrack({ points: [[0, 0], [RACE_LEN, RACE_LEN]] });
    const p = t.sample(RACE_LEN / 2, 0);
    expect(p.pitch ?? 0).toBeCloseTo(0, 3);
    expect(p.headingY).not.toBe(0);
  });
});
