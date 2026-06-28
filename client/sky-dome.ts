// Shared gradient sky dome — used by BOTH the game renderer and the level editor so the editor
// preview matches the game exactly (one source of truth, can't drift). An inside-out sphere with a
// top→bottom color gradient; set its two colors via setSkyColors().
import * as THREE from 'three';

export function makeSkyDome(radius = 2500): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x2a6cff) }, bottom: { value: new THREE.Color(0xbfe0ff) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = clamp((normalize(vP).y*0.5)+0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
}

/** Set the dome's top + bottom gradient colors (hex strings or numbers). */
export function setSkyColors(sky: THREE.Mesh, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation): void {
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  (u.top!.value as THREE.Color).set(top);
  (u.bottom!.value as THREE.Color).set(bottom);
}
