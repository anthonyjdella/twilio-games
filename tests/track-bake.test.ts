// The game IGNORES a level's saved `track` transform — it pins the race to the canonical (identity)
// frame and only applies the map's `model` transform (see main.ts / map-world CANONICAL_TRACK). But
// the editor lets you align a level by moving the TRACK onto a stationary map. A level aligned that
// way saves a big `track` offset the game throws away → in-game the map floats off-camera and you see
// only the track (the "Drift" bug). bakeTrackIntoModel folds the track transform into the map and
// resets the track to identity, so what you aligned in the editor is exactly what the game renders.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bakeTrackIntoModel } from '../client/track-bake';
import type { LevelTransform } from '../shared/level';

const d2r = (d: number) => (d * Math.PI) / 180;

/** Build the world matrix a LevelTransform represents (pos · rot(XYZ) · uniform scale). */
function mat(t: LevelTransform): THREE.Matrix4 {
  const p = new THREE.Vector3().fromArray(t.pos);
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(d2r(t.rotDeg[0] ?? 0), d2r(t.rotDeg[1] ?? 0), d2r(t.rotDeg[2] ?? 0), 'XYZ'));
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3().setScalar(t.scale || 1));
}

/** Where a point authored in the MAP's local space lands in world, given a model transform. */
function mapPointWorld(local: number[], model: LevelTransform): THREE.Vector3 {
  return new THREE.Vector3().fromArray(local).applyMatrix4(mat(model));
}

/** Where a point on the CURVE (track-local) lands in world, given a track transform. */
function curvePointWorld(local: number[], track: LevelTransform): THREE.Vector3 {
  return new THREE.Vector3().fromArray(local).applyMatrix4(mat(track));
}

describe('bakeTrackIntoModel', () => {
  it('resets the track to identity (the frame the game actually renders in)', () => {
    const model: LevelTransform = { pos: [1802, 1497, -1078], rotDeg: [0, -11, 0], scale: 31.245 };
    const track: LevelTransform = { pos: [-5437, 194, -6437], rotDeg: [0, 35, 0], scale: 14.161 };
    const out = bakeTrackIntoModel(model, track);
    expect(out.track.pos).toEqual([0, 0, 0]);
    expect(out.track.rotDeg).toEqual([0, 0, 0]);
    expect(out.track.scale).toBe(1);
  });

  it('preserves the map-relative-to-track placement (editor look == game look)', () => {
    // The author aligned by moving the TRACK. In the EDITOR the map sits relative to the curve as
    // (track⁻¹ · model). In the GAME the curve is identity, so after baking, the map at the baked
    // transform must sit at that SAME relative offset from the (now-identity) curve.
    const model: LevelTransform = { pos: [1802, 1497, -1078], rotDeg: [0, -11, 0], scale: 31.245 };
    const track: LevelTransform = { pos: [-5437, 194, -6437], rotDeg: [0, 35, 0], scale: 14.161 };
    const out = bakeTrackIntoModel(model, track);

    // Pick a few map-local sample points; their world offset FROM a curve point must be identical
    // before (editor: track applied to curve) and after (game: curve at identity, model baked).
    for (const local of [[0, 0, 0], [10, 5, -3], [-40, 12, 7]]) {
      // EDITOR world: map point vs a curve point at curve-local origin.
      const editorMap = mapPointWorld(local, model);
      const editorCurveOrigin = curvePointWorld([0, 0, 0], track);
      const editorRel = editorMap.clone().sub(editorCurveOrigin);
      // GAME world after bake: curve is identity, so curve-local origin is world origin.
      const gameMap = mapPointWorld(local, out.model);
      const gameRel = gameMap.clone().sub(new THREE.Vector3(0, 0, 0));
      // NOTE: track had rotation+scale, so the relative vector is expressed in different bases; the
      // invariant that holds is the map's placement in the CURVE's frame. Compare in that frame:
      const inv = mat(track).clone().invert();
      const editorInCurveFrame = editorMap.clone().applyMatrix4(inv);
      // Precision 1 (±0.05u): the saved format stores rotation as WHOLE degrees (matching the rest of
      // the editor's transform serialization), so over a 31× map scale the placement is preserved to
      // a fraction of a unit — imperceptible on a map spanning hundreds of units.
      expect(gameMap.x).toBeCloseTo(editorInCurveFrame.x, 1);
      expect(gameMap.y).toBeCloseTo(editorInCurveFrame.y, 1);
      expect(gameMap.z).toBeCloseTo(editorInCurveFrame.z, 1);
      void editorRel; void gameRel;
    }
  });

  it('is a no-op (identity model) when the track is already identity', () => {
    const model: LevelTransform = { pos: [10, 2, 700], rotDeg: [0, 45, 0], scale: 3 };
    const identity: LevelTransform = { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: 1 };
    const out = bakeTrackIntoModel(model, identity);
    expect(out.model.pos[0]).toBeCloseTo(10, 3);
    expect(out.model.pos[1]).toBeCloseTo(2, 3);
    expect(out.model.pos[2]).toBeCloseTo(700, 3);
    expect(out.model.rotDeg[1]).toBe(45);
    expect(out.model.scale).toBeCloseTo(3, 3);
    expect(out.track).toEqual({ pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: 1 });
  });

  it('does not mutate its inputs', () => {
    const model: LevelTransform = { pos: [1, 2, 3], rotDeg: [0, 10, 0], scale: 2 };
    const track: LevelTransform = { pos: [5, 0, 5], rotDeg: [0, 20, 0], scale: 4 };
    const modelCopy = structuredClone(model), trackCopy = structuredClone(track);
    bakeTrackIntoModel(model, track);
    expect(model).toEqual(modelCopy);
    expect(track).toEqual(trackCopy);
  });
});
