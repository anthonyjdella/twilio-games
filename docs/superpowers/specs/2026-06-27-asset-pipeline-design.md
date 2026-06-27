# Asset Pipeline + Model Editor — Design

**Date:** 2026-06-27
**Status:** Approved (pending spec review)
**Milestone:** Plan 5a (first of the Plan 5 group: asset pipeline → studio editor → themed zones)

---

## 1. Purpose & Scope

Replace the game's primitive box-and-cylinder placeholders with the user's real GLB
models (downloaded free from Sketchfab), and provide an interactive editor to arrange
and tune how each model sits in the scene.

**Workflow / division of labor:**
- **User** downloads GLB models from Sketchfab and drops them in `assets/`.
- **Claude** runs the inspector, generates + auto-fits the manifest, detects wheels/sizes,
  and takes an automated best-shot at placement (scale/rotation/offset).
- **User** opens the interactive editor and manually tweaks (drag/rotate/scale/arrange)
  to taste, then saves.

**In scope:**
- **GLB asset loader** — load, cache, auto-fit (normalize scale + center), detect wheel
  nodes for spin animation, and **fall back to the existing primitive** on any failure.
- **Manifest** (`assets/manifest.json`) — single source of truth mapping GLB files → game
  roles (player car, AI cars, barrier, boost pad, props) with optional per-model overrides
  (scale, rotation, offset).
- **CLI asset-inspector** (`npm run inspect-assets`) — scan `assets/`, report each model's
  dimensions + detected wheel nodes, and generate/update a starter manifest.
- **Interactive model editor** (`/editor`) — mirrors the real game scene; click-select any
  model (car/barrier/boost pad); adjust scale/rotation/offset via drag-gizmo + numeric
  fields; choose which GLB fills each role; save back to the manifest.
- **CREDITS.md** — model attributions/licenses (Sketchfab free models are typically CC-BY).

**Explicitly NOT in scope** (deferred to later Plan 5 specs):
- Lighting/camera authoring; adding/duplicating/deleting arbitrary objects; themed zones;
  in-browser file upload. The editor here only tunes **transforms + role assignment**.

**Format decision:** GLB only. It is glTF in a single binary file (mesh + materials +
textures + animations embedded) — loaded natively by three.js, no plugins, one HTTP
request per model. Sketchfab offers a GLB/auto-converted-glTF download for every model.
FBX/USDZ are out (extra loaders, conversion, licensing/AR baggage).

**Success criteria:** User drops GLBs in `assets/`; Claude runs the inspector and produces
a working auto-fit manifest; user opens `/editor`, arranges/tunes, saves; the actual game
(`?display=1`) renders the real cars and props (wheels spinning where detected). Any role
without a working GLB silently keeps its primitive — the game never breaks.

---

## 2. Architecture & Components

**Core principle:** the manifest is the single source of truth. The inspector *generates*
it, the editor *writes* it, the loader *reads* it, and the renderer is told *what mesh to
use* without caring whether it's a GLB or a fallback primitive.

```
assets/
  manifest.json          single source of truth (roles -> GLB + overrides)
  *.glb                  user's Sketchfab models
  CREDITS.md             attributions / licenses

shared/
  asset-manifest.ts      Manifest types + parse/validate (pure; shared by tools+client)

tools/
  inspect-assets.ts      CLI: scan assets/, report dims + wheel nodes, generate manifest

client/
  asset-loader.ts        GLB loader: load, cache, auto-fit, wheel-detect, primitive fallback
  car-factory.ts         build a car group from a loaded GLB (or primitive fallback)
  renderer.ts   (MOD)    consume loaded models instead of hardcoded primitives
  editor/
    editor.html          the /editor page
    editor-main.ts       scene mirror + click-select + gizmo + numeric fields + save
    manifest-client.ts   GET current manifest / POST saved manifest

server/
  http-server.ts (MOD)   serve /editor, GET/POST /api/manifest, static-serve assets/
```

**Responsibilities & boundaries:**

| Unit | Responsibility | Boundary |
|------|----------------|----------|
| `asset-manifest.ts` | Typed `Manifest`/`AssetRef`; parse + validate; merge overrides | Pure, no I/O — the seam everything talks through |
| `inspect-assets.ts` | Headless GLB scan → report dims + wheel nodes → emit starter manifest | CLI; run when models are added |
| `asset-loader.ts` | Load GLB, auto-fit, apply overrides, detect wheels, cache; **fallback to primitive on any failure** | Owns all GLB I/O + normalization |
| `car-factory.ts` | Produce renderable car group (with `wheels[]` if detected) | Replaces inline box-building |
| `renderer.ts` (mod) | Unchanged in *what* it draws; changed in *how* it gets meshes | Interpolation/camera untouched |
| `editor/` | Mirror scene, select, transform-gizmo, write working manifest, save via API | Transforms + roles only |
| `http-server.ts` (mod) | Static-serve `assets/` + `/editor`; `GET/POST /api/manifest` | Slots into Plan 2 HTTP server |

**Types (the contract):**
```
AssetRef  = { file: string; scale?: number; rotation?: [number,number,number]; offset?: [number,number,number] }
Manifest  = { cars: AssetRef[]; barrier: AssetRef | null; boostPad: AssetRef | null; props: AssetRef[] }
```

**Why fallback-to-primitive matters:** the game already works with primitives, so the asset
pipeline is *purely additive*. Every role with a working GLB gets upgraded; every role
without keeps its box. A half-filled manifest, a corrupt download, or a typo yields a
less-pretty game, never a broken one — so models can be filled in one at a time.

---

## 3. Data Flow & Key Behaviors

**Authoring loop:**
```
1. User downloads GLBs from Sketchfab -> drops in assets/
2. Claude runs: npm run inspect-assets
   -> per-model report (dimensions, detected wheel nodes)
   -> writes/updates assets/manifest.json (roles + auto-fit defaults)
   -> Claude takes an automated best-shot at scale/rotation/offset
3. User opens http://localhost:5173/editor
   -> mirrors the game scene with current manifest applied
   -> click a car/barrier/boost pad -> adjust scale/rotation/offset (gizmo + fields)
   -> pick which GLB fills each role (dropdown)
   -> Save -> POST /api/manifest -> writes assets/manifest.json
4. User opens the game (?display=1) -> tuned models render live
```

**Runtime load (game start):**
```
client boot -> fetch manifest -> for each role:
   load GLB -> auto-fit to role target box -> apply manifest overrides
            -> detect wheel nodes -> cache
   on ANY failure (missing/corrupt/timeout) -> use primitive fallback
-> renderer draws cars/items from loaded assets; wheels spin if detected,
   else whole-car bob; positions/lanes/physics unchanged (server-authoritative)
```

**Key behaviors:**
- **Auto-fit:** each model is scaled so its bounding box fits a role target (cars ~2×4
  footprint, barriers ~lane-width, boost pads ~disc) and centered on its base — a tiny
  model and a huge model both come out correctly sized and sitting on the road.
- **Wheel detection:** node names matched against `/wheel|tire|rim/i`; matched meshes spin
  proportional to speed (the original split-model animation goal). No matches → the whole
  car gets a subtle motion cue instead.
- **Overrides win over auto-fit:** editor-set `scale`/`rotation`/`offset` apply on top of
  auto-fit — a manual fix always takes precedence.
- **Manifest validation:** malformed manifest (bad JSON, unknown role, missing file) does
  not crash — the loader logs and falls back per-role.

---

## 4. Testing

- **`asset-manifest.ts`** (pure) — unit: parse valid/invalid, override merge, validation
  errors. Fully offline.
- **`asset-loader.ts` logic** — unit-test the pure parts: auto-fit math (bbox → scale),
  wheel-node detection against fixture node-name lists, fallback selection. GLB decode
  itself is exercised by the inspector against a real sample GLB.
- **`inspect-assets.ts`** — test against a tiny committed sample GLB (a primitive exported
  to GLB) → asserts it reports dimensions + (no) wheel nodes and emits valid manifest JSON.
- **Manifest API** — integration: POST a manifest, GET it back, assert round-trip + bad
  payloads rejected.
- **Editor rendering & gizmo** — verified by running (build + typecheck + manual `/editor`
  check), like the client in Plan 1; three.js interaction is not unit-tested.

**External-dependency spike (first task):** loading GLB headless in Node (for the inspector
+ tests) — three.js GLTFLoader needs a DOM-ish/GL environment in Node. The plan's first
task pins the exact approach (e.g. `@gltf-transform/core` for structural inspection without
a GL context, or a headless-GL setup) before building the pipeline on top of it, so the
risky bit is proven first.

---

## 5. Open Risks

- **Headless GLB decode in Node** — the one unknown; isolated and proven in task 1.
- **Free-model variance** — wild scale/orientation/pivot differences; mitigated by auto-fit
  + per-model overrides + the interactive editor for final polish.
- **Wheel-name conventions vary** — some models won't match `/wheel|tire|rim/i`; those fall
  back to whole-car motion (acceptable; editor can't fix node names, only transforms).
- **Licenses** — CC-BY models need attribution; tracked in `CREDITS.md` as models are added.
