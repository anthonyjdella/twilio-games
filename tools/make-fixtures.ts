// Authors two tiny GLB fixtures used by tests. Run once: `npx tsx tools/make-fixtures.ts`.
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync } from 'node:fs';

function boxPositions(sx: number, sy: number, sz: number): Float32Array {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  // 12 triangles (36 verts) of an axis-aligned box centered at origin
  const v = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], // back
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], // front
  ];
  const faces = [[0, 1, 2, 0, 2, 3], [4, 6, 5, 4, 7, 6], [0, 4, 5, 0, 5, 1], [3, 2, 6, 3, 6, 7], [1, 5, 6, 1, 6, 2], [0, 3, 7, 0, 7, 4]];
  const out: number[] = [];
  for (const f of faces) for (const i of f) out.push(...v[i]!);
  return new Float32Array(out);
}

async function makeBox(path: string, name: string, sx: number, sy: number, sz: number, childNames: string[] = []) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const mk = (nm: string, dims: [number, number, number], tx = 0) => {
    const arr = boxPositions(...dims);
    const pos = doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buffer);
    // glTF requires POSITION accessors to declare min/max; @gltf-transform computes them
    // from the array on write, and the headless reader reads them back via getMin/getMax.
    const prim = doc.createPrimitive().setAttribute('POSITION', pos);
    const mesh = doc.createMesh(nm + '_mesh').addPrimitive(prim);
    const node = doc.createNode(nm).setMesh(mesh).setTranslation([tx, 0, 0]);
    return node;
  };
  if (childNames.length === 0) {
    scene.addChild(mk(name, [sx, sy, sz]));
  } else {
    const root = doc.createNode(name);
    root.addChild(mk(name + '_body', [sx, sy, sz]));
    childNames.forEach((cn, i) => root.addChild(mk(cn, [0.4, 0.4, 0.4], -1.5 + i)));
    scene.addChild(root);
  }
  mkdirSync('assets/fixtures', { recursive: true });
  await new NodeIO().write(path, doc);
  console.log('wrote', path);
}

await makeBox('assets/fixtures/box.glb', 'Box', 1, 1, 1);
await makeBox('assets/fixtures/car4wheel.glb', 'Car', 2, 0.8, 4,
  ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']);
