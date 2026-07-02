// The PURE half of the per-type attack FX: type → visual recipe (shape/travel/color/motion) + the
// attacker→defender aim vector. The canvas drawing that turns a spec into pixels isn't unit-tested
// (it's purely visual); this locks the mapping so each type stays DISTINCT and colors stay in sync
// with typeColor (one source of truth).
import { describe, it, expect } from 'vitest';
import { fxSpecFor, aimVector, SIDE_POS } from '../client/battle/fx-spec';
import { typeColor } from '../client/battle/monster-sprite';
import { MONSTER_TYPES, type MonsterType } from '../shared/monster-types';

describe('fxSpecFor', () => {
  it('gives every type a fully-populated recipe', () => {
    for (const t of MONSTER_TYPES) {
      const s = fxSpecFor(t);
      expect(s.color).toBe(typeColor(t));            // color is sourced from the single palette
      expect(s.count).toBeGreaterThan(0);
      expect(s.impactCount).toBeGreaterThan(0);
      expect(s.life).toBeGreaterThan(0);
      expect(s.size).toBeGreaterThan(0);
    }
  });

  it('makes each type visually DISTINCT — no two share the same shape', () => {
    const shapes = MONSTER_TYPES.map(t => fxSpecFor(t as MonsterType).shape);
    expect(new Set(shapes).size).toBe(MONSTER_TYPES.length);   // 9 unique shapes for 9 types
  });

  it('keeps the signature shapes: fire=ember/rise, water=droplet/arc, electric=bolt+strobe', () => {
    const fire = fxSpecFor('fire');
    expect(fire.shape).toBe('ember'); expect(fire.travel).toBe('rise'); expect(fire.gravity).toBeLessThan(0);
    const water = fxSpecFor('water');
    expect(water.shape).toBe('droplet'); expect(water.travel).toBe('arc'); expect(water.gravity).toBeGreaterThan(0);
    const elec = fxSpecFor('electric');
    expect(elec.shape).toBe('bolt'); expect(elec.strobe).toBe(true);
    expect(fxSpecFor('psychic').travel).toBe('warp');   // psychic blooms on the target, doesn't travel
  });

  it('falls back to the normal impact-star for an unknown type (never crashes)', () => {
    expect(fxSpecFor('bogus').shape).toBe('star');
    expect(fxSpecFor('bogus').color).toBe(typeColor('normal'));
  });
});

describe('aimVector', () => {
  it('is a unit vector pointing from the attacker toward the defender', () => {
    const v = aimVector('a', 'b');   // a (bottom-left) → b (top-right): +x, -y
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });

  it('reverses when the sides swap', () => {
    const ab = aimVector('a', 'b'), ba = aimVector('b', 'a');
    expect(ba.x).toBeCloseTo(-ab.x, 5);
    expect(ba.y).toBeCloseTo(-ab.y, 5);
  });

  it('anchors a bottom-left, b top-right (matches the renderer layout)', () => {
    expect(SIDE_POS.a.x).toBeLessThan(SIDE_POS.b.x);
    expect(SIDE_POS.a.y).toBeGreaterThan(SIDE_POS.b.y);
  });
});
