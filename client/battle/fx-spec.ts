// The PURE half of the per-type attack FX: given a move's TYPE, what does its effect LOOK like? Each
// type maps to a distinct SHAPE + COLOR + MOTION recipe (embers rise, droplets arc, a bolt strobes…)
// so a fire attack never reads like a water one. Kept as data + tiny math helpers here (no canvas, no
// DOM) so it's the single source of truth the AttackFx renderer consumes AND it's unit-testable. The
// canvas drawing that turns a spec into pixels lives in attack-fx.ts.
import { typeColor } from './monster-sprite';
import type { MonsterType } from '../../shared/monster-types';

// Attacker/defender anchor points in GB-logical coords (must match battle-renderer's layout):
// 'a' (you) is bottom-left, 'b' (foe) is top-right — sprite CENTERS, roughly.
export const SIDE_POS: Record<'a' | 'b', { x: number; y: number }> = {
  a: { x: 44, y: 60 },
  b: { x: 108, y: 30 },
};

/** The particle SHAPE a type draws — each is a distinct pixel motif so types read apart at a glance. */
export type FxShape =
  | 'ember'   // fire: rising square embers, flicker fade
  | 'droplet' // water: falling/splashing round drops
  | 'bolt'    // electric: jagged forked segments + strobe
  | 'leaf'    // grass: spinning 3px blades
  | 'ring'    // psychic: expanding concentric squares (warp)
  | 'shard'   // rock: tumbling angular chunks
  | 'dust'    // ground: low drifting dust puff
  | 'streak'  // flying: fast thin wind slashes
  | 'star';   // normal: 4-point impact spark

/** How a type's PROJECTILE travels from attacker → defender (flavor of the launch phase). */
export type FxTravel =
  | 'arc'      // lobbed parabola (water, rock)
  | 'straight' // dead-line dart (electric, flying, normal)
  | 'rise'     // floats up from the caster (fire, ground)
  | 'warp';    // no travel — blooms on the target (psychic)

/** The full visual recipe for one type's attack. Counts are kept small (Game-Boy sparse), speeds are
 *  per-frame in GB pixels. `strobe` types flash the whole screen faintly on cast (electric). */
export interface FxSpec {
  shape: FxShape;
  travel: FxTravel;
  color: string;      // primary (from typeColor — one source of truth for "the color of fire")
  color2: string;     // secondary highlight/edge
  count: number;      // particles spawned on the launch burst
  impactCount: number;// particles spawned on the hit burst (usually a touch more)
  spread: number;     // burst cone / scatter radius in GB px
  gravity: number;    // per-frame downward accel (negative = floats up)
  life: number;       // particle lifetime in frames
  size: number;       // base particle size in GB px (chunky)
  strobe: boolean;    // flash the arena briefly on cast (electric)
}

// Secondary/edge tints per type — a brighter or contrasting partner to the signature color so the
// pixels have internal shading instead of one flat fill.
const EDGE: Record<MonsterType, string> = {
  normal: '#ffffff', fire: '#ffd23f', water: '#bfe3ff', grass: '#c6f06a',
  electric: '#ffffff', rock: '#e8cf9a', ground: '#f0dcae', flying: '#ffffff',
  psychic: '#f7b8ec',
};

// Per-type recipes. Tuned so each is DISTINCT in shape+motion+color, but all stay sparse + chunky.
const SPECS: Record<MonsterType, Omit<FxSpec, 'color' | 'color2'>> = {
  fire:     { shape: 'ember',   travel: 'rise',     count: 14, impactCount: 18, spread: 10, gravity: -0.10, life: 28, size: 2, strobe: false },
  water:    { shape: 'droplet', travel: 'arc',      count: 12, impactCount: 16, spread: 9,  gravity: 0.14,  life: 26, size: 2, strobe: false },
  electric: { shape: 'bolt',    travel: 'straight', count: 5,  impactCount: 8,  spread: 7,  gravity: 0,     life: 14, size: 1, strobe: true  },
  grass:    { shape: 'leaf',    travel: 'arc',      count: 11, impactCount: 14, spread: 12, gravity: 0.03,  life: 34, size: 3, strobe: false },
  psychic:  { shape: 'ring',    travel: 'warp',     count: 4,  impactCount: 5,  spread: 4,  gravity: 0,     life: 30, size: 2, strobe: false },
  rock:     { shape: 'shard',   travel: 'arc',      count: 9,  impactCount: 12, spread: 11, gravity: 0.16,  life: 30, size: 3, strobe: false },
  ground:   { shape: 'dust',    travel: 'rise',     count: 13, impactCount: 16, spread: 13, gravity: -0.04, life: 30, size: 3, strobe: false },
  flying:   { shape: 'streak',  travel: 'straight', count: 8,  impactCount: 10, spread: 8,  gravity: 0,     life: 16, size: 2, strobe: false },
  normal:   { shape: 'star',    travel: 'straight', count: 9,  impactCount: 12, spread: 9,  gravity: 0.02,  life: 20, size: 2, strobe: false },
};

/** Resolve a move TYPE → its full visual recipe (shape/travel/colors/counts/motion). Unknown types
 *  fall back to the 'normal' impact-star so a bad move id never crashes the FX layer. */
export function fxSpecFor(type: string): FxSpec {
  const t = (type in SPECS ? type : 'normal') as MonsterType;
  const base = SPECS[t];
  return { ...base, color: typeColor(t), color2: EDGE[t] };
}

/** Unit vector from one side's anchor toward the other (the projectile's travel direction). Returns
 *  {0,0} if the two anchors coincide (never in practice) so callers don't divide by zero. */
export function aimVector(from: 'a' | 'b', to: 'a' | 'b'): { x: number; y: number } {
  const f = SIDE_POS[from], t = SIDE_POS[to];
  const dx = t.x - f.x, dy = t.y - f.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}
