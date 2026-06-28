// client/level.ts
import { LevelScene } from './level-scene';
import { fetchMaps } from './map-world';
import { fetchAssets } from './editor/manifest-client';
import { mergeLevel, levelDefaults, type LevelConfig } from '../shared/level';

const scene = new LevelScene(document.getElementById('app')!);
const sel = document.getElementById('levelSelect') as HTMLSelectElement;
const status = document.getElementById('status')!;
let levels: Record<string, LevelConfig> = {};

const tree = document.getElementById('tree')!;
let assetFiles: string[] = [];
void fetchAssets().then(f => { assetFiles = f; });

function renderTree(): void {
  tree.replaceChildren();
  const mk = (label: string, key: string) => {
    const d = document.createElement('div');
    d.className = 'row' + (scene.selectedKey() === key ? ' sel' : '');
    d.textContent = label; d.onclick = () => { scene.select(key); renderTree(); };
    return d;
  };
  tree.append(mk('🗺 Map', 'map'), mk('🏁 Track', 'track'));
  const cfg = scene.current();
  const h = document.createElement('h4'); h.textContent = `Props (${cfg.props.length})`; tree.append(h);
  for (const p of cfg.props) tree.append(mk(`📦 ${p.file.replace('.glb','')} (${p.id})`, p.id));

  const add = document.createElement('button'); add.className = 'btn'; add.textContent = '＋ Add model';
  add.onclick = () => {
    const file = prompt(`Add which GLB?\nAvailable:\n${assetFiles.join('\n')}`, assetFiles[0] ?? '');
    if (file) { scene.addProp(file); renderTree(); }
  };
  const dup = document.createElement('button'); dup.className = 'btn'; dup.textContent = 'Duplicate';
  dup.onclick = () => { if (scene.duplicateSelectedProp()) renderTree(); };
  const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Delete';
  del.onclick = () => { scene.removeSelectedProp(); renderTree(); };
  tree.append(document.createElement('br'), add, dup, del);
}

scene.onChange(() => renderTree());

async function refresh(selectKey?: string): Promise<void> {
  const raw = await fetchMaps();
  levels = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, mergeLevel(v)]));
  sel.replaceChildren();
  for (const key of Object.keys(levels)) {
    const o = document.createElement('option'); o.value = key; o.textContent = key; sel.appendChild(o);
  }
  const key = selectKey ?? Object.keys(levels)[0];
  if (key) { sel.value = key; await scene.loadLevel(structuredClone(levels[key]!)); }
  renderTree();
}

sel.addEventListener('change', async () => {
  await scene.loadLevel(structuredClone(levels[sel.value]!)); renderTree();
});

document.getElementById('newLevel')!.addEventListener('click', async () => {
  const map = prompt('New level key (e.g. canyon):')?.trim();
  if (!map) return;
  const file = prompt('World GLB filename in assets/maps (e.g. canyon.glb):', `${map}.glb`)?.trim();
  if (!file) return;
  if (levels[map] && !confirm(`Overwrite existing level "${map}"?`)) return;
  levels[map] = levelDefaults(map, file);
  await scene.loadLevel(structuredClone(levels[map]!));
  const o = document.createElement('option'); o.value = map; o.textContent = map; sel.appendChild(o); sel.value = map;
  renderTree();
});

document.getElementById('saveLevel')!.addEventListener('click', async () => {
  const cfg = scene.current();
  try {
    const res = await fetch('/api/maps', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    status.textContent = res.ok ? `Saved "${cfg.map}" ✓` : 'Save failed';
  } catch { status.textContent = 'Server unreachable'; }
  setTimeout(() => (status.textContent = ''), 2500);
});

void refresh();
