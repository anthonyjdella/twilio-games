import { describe, it, expect, afterEach } from 'vitest';
import { ManifestStore } from '../server/manifest-store';
import { unlink } from 'node:fs/promises';

const tmp = 'assets/_test-manifest.json';
afterEach(async () => { try { await unlink(tmp); } catch {} });

describe('ManifestStore', () => {
  it('returns EMPTY_MANIFEST when the file does not exist', async () => {
    const s = new ManifestStore('assets/_does-not-exist.json');
    const m = await s.read();
    expect(m).toEqual({ cars: [], barrier: null, boostPad: null, props: [] });
  });
  it('round-trips a written manifest', async () => {
    const s = new ManifestStore(tmp);
    await s.write({ cars: [{ file: 'a.glb', scale: 2 }], barrier: null, boostPad: null, props: [] });
    const m = await s.read();
    expect(m.cars[0]!.file).toBe('a.glb');
    expect(m.cars[0]!.scale).toBe(2);
  });
});
