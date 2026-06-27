import { readFile, writeFile } from 'node:fs/promises';
import { parseManifest, serializeManifest, EMPTY_MANIFEST, type Manifest } from '../shared/asset-manifest';

export class ManifestStore {
  constructor(private path: string) {}
  async read(): Promise<Manifest> {
    try { return parseManifest(await readFile(this.path, 'utf8')); }
    catch { return { ...EMPTY_MANIFEST }; }
  }
  async write(m: Manifest): Promise<void> {
    await writeFile(this.path, serializeManifest(m));
  }
}
