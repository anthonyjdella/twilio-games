import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/** Read GLB structure headlessly (no GL context): node names + bbox size + animation clip names.
 *  Registers ALL_EXTENSIONS so real-world models (e.g. KHR_materials_specular, EXT_texture_webp)
 *  don't fail the read. Compressed (Draco) files additionally need a decoder; the inspector runs
 *  on PRE-compression originals, so plain ALL_EXTENSIONS registration is sufficient here. */
export async function readGlb(path: string): Promise<{ nodeNames: string[]; size: [number, number, number]; animationNames: string[] }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path);
  const root = doc.getRoot();
  const nodeNames = root.listNodes().map(n => n.getName()).filter(Boolean);
  const animationNames = root.listAnimations().map(a => a.getName()).filter(Boolean);
  // accumulate world-space bounds across every mesh primitive POSITION accessor
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const t = node.getWorldTranslation();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const a = pos.getMin([] as number[]) ?? [0, 0, 0];
      const b = pos.getMax([] as number[]) ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, (a[i] ?? 0) + (t[i] ?? 0));
        max[i] = Math.max(max[i]!, (b[i] ?? 0) + (t[i] ?? 0));
      }
    }
  }
  const size: [number, number, number] = [
    Number.isFinite(max[0]! - min[0]!) ? max[0]! - min[0]! : 0,
    Number.isFinite(max[1]! - min[1]!) ? max[1]! - min[1]! : 0,
    Number.isFinite(max[2]! - min[2]!) ? max[2]! - min[2]! : 0,
  ];
  return { nodeNames, size, animationNames };
}
