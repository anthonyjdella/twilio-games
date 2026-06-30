import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Build a car group: clone the GLB template if present (preserving wheel tags), else the primitive. */
export function buildCar(template: THREE.Group | null, color: string, isMe: boolean): THREE.Group {
  let g: THREE.Group;
  if (template) {
    // SkeletonUtils.clone rebinds SkinnedMesh instances to the cloned Skeleton, so the
    // 2nd+ instance of a rigged/animated GLB animates correctly (plain clone() does not).
    // It returns an Object3D; wrap in a Group if it isn't already one so we keep the THREE.Group contract.
    const cloned = skeletonClone(template);
    g = cloned instanceof THREE.Group ? cloned : new THREE.Group().add(cloned);
    // re-collect wheels on the clone by matching the template's wheel names
    const wheelNames = new Set((template.userData.wheels as THREE.Object3D[] ?? []).map(w => w.name));
    const wheels: THREE.Object3D[] = [];
    g.traverse(o => { if (wheelNames.has(o.name)) wheels.push(o); });
    g.userData.wheels = wheels;
    // If the model has a baked animation clip, set up a mixer to play it (preferred over wheel-spin).
    const clips = (template.userData.clips as THREE.AnimationClip[]) ?? [];
    if (clips.length > 0) {
      const mixer = new THREE.AnimationMixer(g);
      mixer.clipAction(clips[0]!).play();
      g.userData.mixer = mixer;   // renderer advances it each frame: mixer.update(dt)
    }
  } else {
    g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 3.4),
      new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4 }));
    body.position.y = 0.75; g.add(body);
    const wheels: THREE.Object3D[] = [];
    for (const [x, z] of [[-1.05, -1.1], [1.05, -1.1], [-1.05, 1.1], [1.05, 1.1]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x0a0d16 }));
      w.rotation.z = Math.PI / 2; w.position.set(x!, 0.5, z!); g.add(w); wheels.push(w);
    }
    g.userData.wheels = wheels;
  }
  // A floating arrow above EVERY car, colored to that caller (so on the shared screen each player can
  // spot their own car by its color). The local keyboard player ('isMe') gets a slightly bigger arrow
  // so "your car" still stands out. color is a CSS string (e.g. "#36d1dc"); THREE.Color parses it.
  const arrowColor = new THREE.Color(color);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(isMe ? 0.7 : 0.55, isMe ? 1.4 : 1.1, 4),
    new THREE.MeshBasicMaterial({ color: arrowColor }));
  cone.rotation.x = Math.PI; cone.position.y = 4;
  cone.userData.isPlayerArrow = true;   // tag so the renderer can bob it / find it later
  g.add(cone);
  return g;
}
