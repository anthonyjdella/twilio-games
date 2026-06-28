// client/level.ts
import { LevelScene } from './level-scene';
import { fetchMaps } from './map-world';
import { fetchAssets } from './editor/manifest-client';
import { numberRow, colorRow, heading } from './level-panels';
import { mergeLevel, levelDefaults, DEFAULT_LIGHTING, DEFAULT_EFFECTS,
         type LevelConfig } from '../shared/level';

const LANES_PREVIEW = 3;

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

const panel = document.getElementById('panel')!;

/** Append a labelled button that runs `onClick` to `host`. */
function button(host: HTMLElement, label: string, onClick: () => void): void {
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = label;
  b.onclick = onClick; host.append(b);
}

function renderPanel(): void {
  panel.replaceChildren();
  const key = scene.selectedKey();
  heading(panel, key === 'map' ? 'Map' : key === 'track' ? 'Track' : `Prop ${key}`);
  // Transform fine-tune rows per object are edited via the gizmo for now; the Cars section below is
  // level-wide and always shown.

  // Track inspector: in-panel curve/width buttons driving the live CurveEditor. Position/rotation/
  // scale of the whole track is the gizmo; these buttons bend the curve + tune the lane/shoulder
  // width. (Pointer-drag point editing is deferred to a later pass.)
  if (key === 'track') {
    const note = document.createElement('p');
    note.style.cssText = 'font-size:12px;opacity:.7;margin:4px 0';
    note.textContent = 'Drag the green handles in the viewport to bend the track. Buttons below tune it.';
    panel.append(note);
    button(panel, 'Straighten', () => scene.getCurve()?.reset());
    button(panel, 'Sharper corners', () => {
      const c = scene.getCurve(); if (c) c.setSmoothing(c.cornerSmoothing - 0.1);
    });
    button(panel, 'Smoother corners', () => {
      const c = scene.getCurve(); if (c) c.setSmoothing(c.cornerSmoothing + 0.1);
    });
    button(panel, 'Wider sides', () => {
      const c = scene.getCurve(); if (c) c.setShoulder(c.shoulder + 20);
    });
    button(panel, 'Narrower sides', () => {
      const c = scene.getCurve(); if (c) c.setShoulder(c.shoulder - 20);
    });
    button(panel, 'Lanes wider', () => {
      const c = scene.getCurve(); if (c) c.setLaneScale(c.laneScale * 1.2);
    });
    button(panel, 'Lanes narrower', () => {
      const c = scene.getCurve(); if (c) c.setLaneScale(c.laneScale / 1.2);
    });
  }

  // Cars section (always shown — it's level-wide). Overrides are keyed by car INDEX string
  // ("0","1","2", …) — the same key the game uses — NOT a GLB filename. The labels read "Car 1…"
  // (1-based for humans) while the override key stays the 0-based index string.
  heading(panel, 'Cars');
  const lvl = scene.getLevel();
  numberRow(panel, 'All cars size', lvl.cars.masterScale, 0.1, 10, 0.05, (v) => {
    lvl.cars.masterScale = v; scene.applyCars();
  });
  const toggle = document.createElement('label');
  const cb = document.createElement('input'); cb.type = 'checkbox';
  cb.checked = scene.carPreviewEnabled();   // survive the panel re-render that setCarPreview triggers
  cb.onchange = () => scene.setCarPreview(cb.checked);
  toggle.append(cb, document.createTextNode(' Show sample cars')); panel.append(toggle);
  for (let i = 0; i < LANES_PREVIEW; i++) {
    numberRow(panel, `Car ${i + 1} tweak`, lvl.cars.overrides[String(i)] ?? 1, 0.2, 5, 0.05, (v) => {
      lvl.cars.overrides[String(i)] = v; scene.applyCars();
    });
  }

  // Lighting section (always shown — level-wide; replaces zone cycling in-game). Defaults match the
  // renderer's hardcoded look so an explicit level renders identically to today.
  lvl.lighting = lvl.lighting ?? structuredClone(DEFAULT_LIGHTING);
  heading(panel, 'Lighting (replaces zones)');
  numberRow(panel, 'Sun intensity', lvl.lighting.sunIntensity, 0, 6, 0.05, v => { lvl.lighting!.sunIntensity = v; scene.applyLighting(); });
  numberRow(panel, 'Sun X', lvl.lighting.sunPos[0]!, -500, 500, 5, v => { lvl.lighting!.sunPos[0] = v; scene.applyLighting(); });
  numberRow(panel, 'Sun Y', lvl.lighting.sunPos[1]!, 0, 1000, 5, v => { lvl.lighting!.sunPos[1] = v; scene.applyLighting(); });
  numberRow(panel, 'Sun Z', lvl.lighting.sunPos[2]!, -500, 500, 5, v => { lvl.lighting!.sunPos[2] = v; scene.applyLighting(); });
  colorRow(panel, 'Sun color', lvl.lighting.sunColor, h => { lvl.lighting!.sunColor = h; scene.applyLighting(); });
  numberRow(panel, 'Ambient', lvl.lighting.ambientIntensity, 0, 3, 0.05, v => { lvl.lighting!.ambientIntensity = v; scene.applyLighting(); });
  colorRow(panel, 'Sky color', lvl.lighting.skyColor, h => { lvl.lighting!.skyColor = h; scene.applyLighting(); });
  colorRow(panel, 'Ground color', lvl.lighting.groundColor, h => { lvl.lighting!.groundColor = h; scene.applyLighting(); });
  numberRow(panel, 'Exposure', lvl.lighting.exposure, 0.2, 3, 0.05, v => { lvl.lighting!.exposure = v; scene.applyLighting(); });

  // Effects section (always shown — level-wide). Editor previews fog here; full bloom/sky/glow is
  // verified by launching the game.
  lvl.effects = lvl.effects ?? structuredClone(DEFAULT_EFFECTS);
  heading(panel, 'Effects');
  numberRow(panel, 'Bloom strength', lvl.effects.bloom.strength, 0, 3, 0.05, v => { lvl.effects!.bloom.strength = v; scene.applyEffects(); });
  numberRow(panel, 'Bloom radius', lvl.effects.bloom.radius, 0, 2, 0.05, v => { lvl.effects!.bloom.radius = v; scene.applyEffects(); });
  numberRow(panel, 'Bloom threshold', lvl.effects.bloom.threshold, 0, 1, 0.01, v => { lvl.effects!.bloom.threshold = v; scene.applyEffects(); });
  numberRow(panel, 'Fog density', lvl.effects.fog.density, 0, 0.02, 0.0005, v => { lvl.effects!.fog.density = v; scene.applyEffects(); });
  colorRow(panel, 'Fog color', lvl.effects.fog.color, h => { lvl.effects!.fog.color = h; scene.applyEffects(); });
  numberRow(panel, 'Track glow', lvl.effects.trackEmissive, 0, 4, 0.05, v => { lvl.effects!.trackEmissive = v; scene.applyEffects(); });
  numberRow(panel, 'Pulse speed', lvl.effects.pulse.speed, 0, 6, 0.1, v => { lvl.effects!.pulse.speed = v; scene.applyEffects(); });
  numberRow(panel, 'Pulse amount', lvl.effects.pulse.amount, 0, 1, 0.02, v => { lvl.effects!.pulse.amount = v; scene.applyEffects(); });
  colorRow(panel, 'Sky top', lvl.effects.skyTop, h => { lvl.effects!.skyTop = h; scene.applyEffects(); });
  colorRow(panel, 'Sky bottom', lvl.effects.skyBottom, h => { lvl.effects!.skyBottom = h; scene.applyEffects(); });
}

scene.onChange(() => { renderTree(); renderPanel(); });

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
