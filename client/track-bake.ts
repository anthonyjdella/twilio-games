// Fold a level's TRACK transform into its MAP transform, so the level renders in-game the way it
// looks in the editor.
//
// WHY THIS EXISTS: the game does NOT apply a level's saved `track` transform — it pins the race to
// the canonical (identity) frame and only places the map via `model` (see map-world.ts CANONICAL_TRACK
// + main.ts applyLevel). The editor, however, lets you align a level by moving the TRACK onto a
// stationary map. A level aligned that way saves a large `track` offset the game throws away, so
// in-game the map floats off-camera and you see only the track (the "Drift" bug).
//
// The camera is the reason the game can't just honor `track`: it samples the curve in sim-local
// coords and writes them straight to camera.position in WORLD space (the camera isn't parented to the
// track group, but the cars are). Transforming the track group would desync cars from the camera. So
// the game deliberately keeps the track at identity — and we make saves conform by baking any track
// transform into the map instead: new_model = track⁻¹ · model, track := identity. The map's placement
// *relative to the curve* is preserved exactly, which is what the author actually aligned.
import * as THREE from 'three';
import type { LevelTransform } from '../shared/level';

const d2r = (d: number) => (d * Math.PI) / 180;
const r2d = (r: number) => (r * 180) / Math.PI;

function matrixOf(t: LevelTransform): THREE.Matrix4 {
  const pos = new THREE.Vector3().fromArray(t.pos);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(d2r(t.rotDeg[0] ?? 0), d2r(t.rotDeg[1] ?? 0), d2r(t.rotDeg[2] ?? 0), 'XYZ'));
  const scl = new THREE.Vector3().setScalar(t.scale || 1);
  return new THREE.Matrix4().compose(pos, quat, scl);
}

function transformOf(m: THREE.Matrix4): LevelTransform {
  const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scl = new THREE.Vector3();
  m.decompose(pos, quat, scl);
  const e = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p;
  return {
    pos: [round(pos.x), round(pos.y), round(pos.z)],
    rotDeg: [Math.round(r2d(e.x)), Math.round(r2d(e.y)), Math.round(r2d(e.z))],
    scale: round(scl.x),   // uniform scale: x == y == z
  };
}

/** Identity track transform — the frame the game renders in. */
const IDENTITY: LevelTransform = { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: 1 };

/**
 * Re-express `model` in the TRACK's frame and reset the track to identity, so the game (which pins
 * the track to identity) renders the map exactly where the editor showed it. Pure — inputs untouched.
 */
export function bakeTrackIntoModel(
  model: LevelTransform, track: LevelTransform,
): { model: LevelTransform; track: LevelTransform } {
  const baked = new THREE.Matrix4().copy(matrixOf(track)).invert().multiply(matrixOf(model));
  return { model: transformOf(baked), track: { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: 1 } };
}

export { IDENTITY as IDENTITY_TRACK };
