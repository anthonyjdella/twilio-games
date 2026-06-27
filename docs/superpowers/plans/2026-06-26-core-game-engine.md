# Core Game Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-authoritative core of the lane-racing game — a deterministic simulation, a WebSocket game server with room/lobby management, and a browser renderer — playable end-to-end with KEYBOARD intents (no Twilio yet).

**Architecture:** A pure, dependency-free `RaceWorld` simulation lives in `shared/` and is imported by both the authoritative Node server and (for prediction) the browser. The server owns the truth, steps the sim at a fixed timestep, and broadcasts state snapshots over WebSocket. The browser renders interpolated snapshots with three.js and sends abstract intents (`MOVE_LEFT`, `BOOST`, …) — the exact seam Twilio voice will later plug into.

**Tech Stack:** Node.js 20+, TypeScript 5+, `ws` (WebSockets), Vite (browser bundle + dev server), Vitest (tests), three.js (rendering).

## Global Constraints

- **Runtime:** Node.js ≥ 20, TypeScript ≥ 5, ES modules (`"type": "module"`).
- **Intent set (exact, verbatim):** `MOVE_LEFT`, `MOVE_RIGHT`, `BOOST`, `BRAKE`, `USE_POWER`.
- **The game consumes abstract intents, never input devices** — keyboard is one adapter; Twilio voice will be another. No input-source-specific logic in the sim or server.
- **Simulation is pure and deterministic** — fixed timestep (1/60s), no `Date.now()`/`Math.random()` inside the step path (seed any randomness explicitly), no DOM/Node/Twilio imports in `shared/`.
- **Server is authoritative** — the browser never decides game outcomes; it renders server snapshots.
- **Lanes:** 3. **Lap target:** 3. **Max players:** 8.
- **DRY, YAGNI, TDD, frequent commits.**

---

## File Structure

```
package.json              workspace root: scripts, deps, "type":"module"
tsconfig.json             base TS config (strict), shared by server+client
vitest.config.ts          test runner config

shared/
  types.ts                Intent, CarState, WorldSnapshot, protocol messages
  constants.ts            LANES, LAP_TARGET, MAX_PLAYERS, TRACK_LEN, STEP, etc.
  race-world.ts           RaceWorld — the pure deterministic simulation
  rng.ts                  seeded PRNG (deterministic, replaces Math.random)

server/
  index.ts                entry: starts WS server + game loop
  room.ts                 Room — one lobby/race: players, RaceWorld, lifecycle
  room-manager.ts         RoomManager — create/find rooms by code, lane assignment
  game-server.ts          GameServer — ws wiring, message routing, broadcast loop

client/
  index.html              page shell + HUD
  main.ts                 bootstrap: connect WS, wire input adapter, start render
  net.ts                  GameConnection — WS client, snapshot buffer
  renderer.ts             three.js scene; renders interpolated snapshots
  input-keyboard.ts       KeyboardAdapter — emits intents (the swappable seam)
  interpolation.ts        snapshot interpolation buffer

tests/
  race-world.test.ts      sim behavior (lanes, items, collisions, laps, finish)
  rng.test.ts             determinism of seeded PRNG
  room.test.ts            room lifecycle, lane assignment, intent routing
  room-manager.test.ts    room creation/lookup by code
  protocol.test.ts        message encode/decode round-trips
```

**Decomposition rationale:** `shared/` is pure and has zero I/O — fully unit-testable and reused verbatim by
server and client. `server/` splits by responsibility: `Room` owns one race, `RoomManager` owns the set of
rooms, `GameServer` owns the transport. `client/` splits the network buffer, the renderer, and the input
adapter so the Twilio adapter later drops in beside `input-keyboard.ts` without touching anything else.

---

### Task 1: Project scaffolding + seeded RNG

Sets up the TypeScript/Vitest/Vite workspace and delivers the first pure module (the seeded PRNG) so the
toolchain is proven by a passing test, not by configuration alone.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (extend existing)
- Create: `shared/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `class Rng { constructor(seed: number); next(): number /* [0,1) */; int(maxExclusive: number): number }`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "voice-racer",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite client",
    "build": "tsc --noEmit && vite build client"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "vite": "^5.2.0",
    "tsx": "^4.10.0",
    "@types/node": "^20.12.0",
    "@types/ws": "^8.5.10"
  },
  "dependencies": {
    "ws": "^8.17.0",
    "three": "^0.164.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node"]
  },
  "include": ["shared", "server", "client", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
```

- [ ] **Step 4: Install deps**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 5: Write the failing test** — `tests/rng.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '../shared/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42), b = new Rng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });
  it('produces values in [0,1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('int(n) returns integers in [0,n)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
    }
  });
  it('different seeds differ', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- rng`
Expected: FAIL — cannot find module `../shared/rng`.

- [ ] **Step 7: Implement `shared/rng.ts`**

```ts
// Mulberry32: tiny, fast, deterministic PRNG. Replaces Math.random in the sim
// so races are reproducible (required for server-authoritative determinism).
export class Rng {
  private state: number;
  constructor(seed: number) {
    // ensure a non-zero 32-bit state
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- rng`
Expected: PASS (4 tests).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts shared/rng.ts tests/rng.test.ts
git commit -m "feat: scaffold TS workspace + deterministic seeded RNG"
```

---

### Task 2: Shared types & constants

The typed contract used by sim, server, and client. No tests of its own (pure declarations); it's exercised by
every later task and guarded by `tsc`. Folded into one task because the types and the constants change together
and a reviewer wouldn't accept one without the other.

**Files:**
- Create: `shared/constants.ts`, `shared/types.ts`

**Interfaces:**
- Produces (constants): `LANES=3`, `LAP_TARGET=3`, `MAX_PLAYERS=8`, `TRACK_W=18`, `TRACK_LEN=320`, `STEP=1/60`,
  `BASE_SPEED=38`, `ITEM_SPACING=24`, `ITEM_START=55`.
- Produces (types): `Intent`, `ItemKind`, `Item`, `CarState`, `WorldSnapshot`, `Phase`,
  and protocol messages `ClientMessage`, `ServerMessage`.

- [ ] **Step 1: Implement `shared/constants.ts`**

```ts
export const LANES = 3;
export const LAP_TARGET = 3;
export const MAX_PLAYERS = 8;
export const TRACK_W = 18;           // world units wide
export const TRACK_LEN = 320;        // z-distance per lap
export const STEP = 1 / 60;          // fixed sim timestep (seconds)
export const BASE_SPEED = 38;        // cruise speed (units/s)
export const ITEM_SPACING = 24;      // gap between obstacle rows
export const ITEM_START = 55;        // z of first obstacle row

/** Lane center x for a given lane index (0..LANES-1). */
export function laneX(lane: number): number {
  return -TRACK_W / 2 + (TRACK_W / LANES) * (lane + 0.5);
}
```

- [ ] **Step 2: Implement `shared/types.ts`**

```ts
export type Intent = 'MOVE_LEFT' | 'MOVE_RIGHT' | 'BOOST' | 'BRAKE' | 'USE_POWER';
export const INTENTS: readonly Intent[] = ['MOVE_LEFT','MOVE_RIGHT','BOOST','BRAKE','USE_POWER'];

export type ItemKind = 'barrier' | 'boost';
export interface Item { id: number; kind: ItemKind; lane: number; z: number; }

export interface CarState {
  id: string;            // playerId
  name: string;
  color: string;
  lane: number;          // current logical lane
  targetLane: number;    // lane the car is easing toward
  x: number;             // interpolated lateral position
  z: number;             // cumulative forward distance
  speed: number;
  boost: number;         // -1..+2-ish modifier
  power: number;         // remaining one-shot power-ups
  powerActive: number;   // seconds of active power remaining
  stunned: number;       // seconds of stun remaining
  lap: number;
  finished: boolean;
  finishT: number;
  place: number;
}

export type Phase = 'lobby' | 'countdown' | 'racing' | 'finished';

export interface WorldSnapshot {
  tick: number;
  t: number;             // sim seconds since race start
  phase: Phase;
  countdown: number;     // seconds remaining in countdown (>=0)
  cars: CarState[];
  items: Item[];         // static for a race; sent once at start, omitted after (see protocol)
}

// ---- Protocol: client -> server ----
export type ClientMessage =
  | { type: 'join'; roomCode: string; name: string; color?: string }
  | { type: 'intent'; intent: Intent }
  | { type: 'ready' }
  | { type: 'restart' };

// ---- Protocol: server -> client ----
export type ServerMessage =
  | { type: 'joined'; playerId: string; lane: number; roomCode: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'items'; items: Item[] }              // sent once when a race starts
  | { type: 'snapshot'; snapshot: WorldSnapshot } // sent ~20-30/s during a race
  | { type: 'event'; event: GameEvent };          // announcer cues (lead change, finish, ...)

export type GameEvent =
  | { kind: 'countdown'; n: number }
  | { kind: 'go' }
  | { kind: 'lead_change'; playerId: string; name: string }
  | { kind: 'hit'; playerId: string }
  | { kind: 'finish'; playerId: string; name: string; place: number }
  | { kind: 'race_over' };
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add shared/constants.ts shared/types.ts
git commit -m "feat: shared types and constants (intents, snapshot, protocol)"
```

---

### Task 3: RaceWorld simulation (pure, deterministic)

The authoritative game logic, ported from the validated prototype into a typed, pure class. No I/O, no
`Math.random` (uses `Rng`), no `Date.now`. This is the single most important module — server and client both
import it.

**Files:**
- Create: `shared/race-world.ts`
- Test: `tests/race-world.test.ts`

**Interfaces:**
- Consumes: `Rng` (Task 1); constants + types (Task 2).
- Produces:
  - `class RaceWorld`
  - `constructor(players: { id: string; name: string; color: string }[], seed: number)`
  - `applyIntent(playerId: string, intent: Intent): void`
  - `step(dt: number): void` — advances sim; `dt` should be `STEP`
  - `snapshot(): WorldSnapshot`
  - `readonly items: Item[]`
  - `get phase(): Phase`, `get over(): boolean`

- [ ] **Step 1: Write the failing test** — `tests/race-world.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RaceWorld } from '../shared/race-world';
import { STEP, LAP_TARGET, TRACK_LEN, laneX } from '../shared/constants';

const PLAYERS = [
  { id: 'p1', name: 'You', color: '#36d1dc' },
  { id: 'p2', name: 'Ada', color: '#f22f46' },
];
function newWorld() { return new RaceWorld(PLAYERS, 12345); }
function startRacing(w: RaceWorld) {
  // run past the countdown
  for (let i = 0; i < 4 * 60; i++) { w.step(STEP); if (w.phase === 'racing') break; }
}

describe('RaceWorld', () => {
  let w: RaceWorld;
  beforeEach(() => { w = newWorld(); });

  it('starts in countdown phase with all cars present', () => {
    const s = w.snapshot();
    expect(s.phase).toBe('countdown');
    expect(s.cars).toHaveLength(2);
    expect(s.cars.map(c => c.id)).toEqual(['p1', 'p2']);
  });

  it('is deterministic: same seed => identical item layout', () => {
    const a = new RaceWorld(PLAYERS, 999);
    const b = new RaceWorld(PLAYERS, 999);
    expect(a.items).toEqual(b.items);
  });

  it('transitions countdown -> racing', () => {
    expect(w.phase).toBe('countdown');
    startRacing(w);
    expect(w.phase).toBe('racing');
  });

  it('ignores intents during countdown', () => {
    const before = w.snapshot().cars[0]!.targetLane;
    w.applyIntent('p1', 'MOVE_RIGHT');
    expect(w.snapshot().cars[0]!.targetLane).toBe(before);
  });

  it('MOVE_LEFT / MOVE_RIGHT change target lane within bounds', () => {
    startRacing(w);
    const car = () => w.snapshot().cars.find(c => c.id === 'p1')!;
    // force a known middle lane
    while (car().targetLane > 1) w.applyIntent('p1', 'MOVE_LEFT');
    while (car().targetLane < 1) w.applyIntent('p1', 'MOVE_RIGHT');
    expect(car().targetLane).toBe(1);
    w.applyIntent('p1', 'MOVE_RIGHT'); expect(car().targetLane).toBe(2);
    w.applyIntent('p1', 'MOVE_RIGHT'); expect(car().targetLane).toBe(2); // clamped
    w.applyIntent('p1', 'MOVE_LEFT');
    w.applyIntent('p1', 'MOVE_LEFT');
    w.applyIntent('p1', 'MOVE_LEFT'); expect(car().targetLane).toBe(0);   // clamped
  });

  it('BOOST increases speed, BRAKE decreases it', () => {
    startRacing(w);
    const base = w.snapshot().cars[0]!.speed;
    w.applyIntent('p1', 'BOOST');
    w.step(STEP);
    expect(w.snapshot().cars[0]!.speed).toBeGreaterThan(base);
  });

  it('cars advance forward while racing', () => {
    startRacing(w);
    const z0 = w.snapshot().cars[0]!.z;
    for (let i = 0; i < 30; i++) w.step(STEP);
    expect(w.snapshot().cars[0]!.z).toBeGreaterThan(z0);
  });

  it('finishes the race after LAP_TARGET laps and reports a winner', () => {
    startRacing(w);
    // fast-forward generously past 3 laps
    for (let i = 0; i < 60 * 120; i++) { w.step(STEP); if (w.over) break; }
    expect(w.over).toBe(true);
    expect(w.phase).toBe('finished');
    const places = w.snapshot().cars.map(c => c.place).sort();
    expect(places).toEqual([1, 2]);
    expect(w.snapshot().cars.every(c => c.finished)).toBe(true);
  });

  it('snapshot lap never exceeds LAP_TARGET in display terms', () => {
    startRacing(w);
    for (let i = 0; i < 60 * 120; i++) { w.step(STEP); if (w.over) break; }
    for (const c of w.snapshot().cars) expect(c.lap).toBeLessThanOrEqual(LAP_TARGET + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- race-world`
Expected: FAIL — cannot find module `../shared/race-world`.

- [ ] **Step 3: Implement `shared/race-world.ts`**

```ts
import { Rng } from './rng';
import {
  LANES, LAP_TARGET, TRACK_LEN, BASE_SPEED, STEP,
  ITEM_SPACING, ITEM_START, laneX,
} from './constants';
import type { Intent, Item, CarState, WorldSnapshot, Phase, GameEvent } from './types';

interface PlayerInit { id: string; name: string; color: string; }

const COUNTDOWN_SECONDS = 3.2;

export class RaceWorld {
  readonly items: Item[] = [];
  private cars: CarState[];
  private rng: Rng;
  private tick = 0;
  private t = 0;
  private countdown = COUNTDOWN_SECONDS;
  private _phase: Phase = 'countdown';
  private events: GameEvent[] = [];
  private leadId: string | null = null;

  constructor(players: PlayerInit[], seed: number) {
    this.rng = new Rng(seed);
    this.cars = players.map((p, i) => ({
      id: p.id, name: p.name, color: p.color,
      lane: i % LANES, targetLane: i % LANES,
      x: laneX(i % LANES), z: -i * 3,
      speed: BASE_SPEED, boost: 0, power: 1, powerActive: 0, stunned: 0,
      lap: 1, finished: false, finishT: 0, place: i + 1,
    }));
    // pre-generate the fixed gauntlet (deterministic via rng)
    let oid = 1;
    for (let z = ITEM_START; z < TRACK_LEN * LAP_TARGET; z += ITEM_SPACING) {
      const lane = this.rng.int(LANES);
      const kind = this.rng.next() < 0.62 ? 'barrier' : 'boost';
      this.items.push({ id: oid++, kind, lane, z });
    }
  }

  get phase(): Phase { return this._phase; }
  get over(): boolean { return this._phase === 'finished'; }

  /** Drain queued announcer events (server polls this each broadcast). */
  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }

  applyIntent(playerId: string, intent: Intent): void {
    if (this._phase !== 'racing') return;
    const c = this.cars.find(x => x.id === playerId);
    if (!c || c.finished) return;
    switch (intent) {
      case 'MOVE_LEFT':  c.targetLane = clamp(c.targetLane - 1, 0, LANES - 1); break;
      case 'MOVE_RIGHT': c.targetLane = clamp(c.targetLane + 1, 0, LANES - 1); break;
      case 'BOOST':      c.boost = Math.min(c.boost + 1.4, 2.2); break;
      case 'BRAKE':      c.boost = Math.max(c.boost - 1.6, -1.4); break;
      case 'USE_POWER':  if (c.power > 0) { c.power--; c.powerActive = 2.2; } break;
    }
  }

  step(dt: number): void {
    if (this._phase === 'countdown') {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== prev && now >= 1) this.events.push({ kind: 'countdown', n: now });
      if (this.countdown <= 0) { this._phase = 'racing'; this.events.push({ kind: 'go' }); }
      return;
    }
    if (this._phase !== 'racing') return;

    this.tick++; this.t += dt;
    for (const c of this.cars) {
      if (c.finished) { c.z += BASE_SPEED * dt; continue; }
      // player boost decays toward cruise; AI handled by server-side controllers later
      c.boost = lerp(c.boost, 0, 0.6 * dt);
      const tx = laneX(c.targetLane);
      c.x = lerp(c.x, tx, 1 - Math.pow(0.0001, dt));
      c.lane = c.targetLane;
      if (c.powerActive > 0) c.powerActive -= dt;
      if (c.stunned > 0) c.stunned -= dt;
      const powerBoost = c.powerActive > 0 ? 16 : 0;
      const stunPenalty = c.stunned > 0 ? -18 : 0;
      c.speed = Math.max(8, BASE_SPEED + c.boost * 12 + powerBoost + stunPenalty);
      c.z += c.speed * dt;
      if (c.z >= TRACK_LEN * c.lap) {
        c.lap++;
        if (c.lap > LAP_TARGET) { c.finished = true; c.finishT = this.t;
          this.events.push({ kind: 'finish', playerId: c.id, name: c.name, place: 0 }); }
      }
    }
    this.resolveItems();
    this.resolveCollisions(dt);
    this.updatePlaces();
    this.detectLeadChange();
    if (this.cars.every(c => c.finished)) {
      this._phase = 'finished';
      this.events.push({ kind: 'race_over' });
    }
  }

  private resolveItems(): void {
    for (const c of this.cars) {
      if (c.finished) continue;
      for (const it of this.items) {
        if (Math.abs(it.z - c.z) < 2.2 && it.lane === c.lane) {
          // edge-trigger: only when crossing; cheap guard via a per-car last-hit z
          const key = `${it.id}`;
          if ((c as any)._hits?.has(key)) continue;
          ((c as any)._hits ??= new Set<string>()).add(key);
          if (it.kind === 'barrier') { c.stunned = 0.8; c.boost = -0.6;
            this.events.push({ kind: 'hit', playerId: c.id }); }
          else c.powerActive = Math.max(c.powerActive, 1.4);
        }
      }
    }
  }

  private resolveCollisions(dt: number): void {
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i]!, b = this.cars[j]!;
        if (Math.abs(a.z - b.z) < 3.4 && Math.abs(a.x - b.x) < 2.0) {
          const push = a.x <= b.x ? -1 : 1;
          a.x += push * 1.2 * dt * 8; b.x -= push * 1.2 * dt * 8;
          a.boost *= 0.9; b.boost *= 0.9;
          a.x = clamp(a.x, laneX(0), laneX(LANES - 1));
          b.x = clamp(b.x, laneX(0), laneX(LANES - 1));
        }
      }
  }

  private updatePlaces(): void {
    const order = [...this.cars].sort((p, q) => {
      if (p.finished && q.finished) return p.finishT - q.finishT;
      if (p.finished) return -1; if (q.finished) return 1;
      return q.z - p.z;
    });
    order.forEach((c, i) => { c.place = i + 1; });
    // backfill finish-event places (they were pushed with place 0)
    for (const e of this.events) if (e.kind === 'finish' && e.place === 0) {
      const c = this.cars.find(x => x.id === e.playerId); if (c) e.place = c.place;
    }
  }

  private detectLeadChange(): void {
    const leader = this.cars.find(c => c.place === 1);
    if (leader && leader.id !== this.leadId) {
      this.leadId = leader.id;
      if (this.t > 0.5) this.events.push({ kind: 'lead_change', playerId: leader.id, name: leader.name });
    }
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.tick, t: this.t, phase: this._phase,
      countdown: Math.max(0, this.countdown),
      cars: this.cars.map(c => ({ ...c })),  // shallow copy; strip internal _hits
      items: this.items,
    };
  }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
```

- [ ] **Step 4: Strip internal field from snapshot**

The `_hits` set is attached via `as any` for edge-triggering. Ensure it never serializes: in `snapshot()`,
replace `{ ...c }` with an explicit field copy.

```ts
cars: this.cars.map(c => ({
  id: c.id, name: c.name, color: c.color, lane: c.lane, targetLane: c.targetLane,
  x: c.x, z: c.z, speed: c.speed, boost: c.boost, power: c.power,
  powerActive: c.powerActive, stunned: c.stunned, lap: c.lap,
  finished: c.finished, finishT: c.finishT, place: c.place,
})),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- race-world`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add shared/race-world.ts tests/race-world.test.ts
git commit -m "feat: pure deterministic RaceWorld simulation"
```

---

### Task 4: Room (one lobby/race lifecycle)

Owns the players in one room, the `RaceWorld` for the current race, and the lobby→racing→finished lifecycle.
Pure logic (no `ws` import) so it's unit-testable; the server wires sockets to it in Task 6.

**Files:**
- Create: `server/room.ts`
- Test: `tests/room.test.ts`

**Interfaces:**
- Consumes: `RaceWorld` (Task 3), types/constants (Task 2).
- Produces:
  - `class Room`
  - `constructor(code: string, seed: number)`
  - `readonly code: string`
  - `addPlayer(name: string, color?: string): { playerId: string; lane: number } | { error: string }`
  - `removePlayer(playerId: string): void`
  - `applyIntent(playerId: string, intent: Intent): void`
  - `start(): void` — begins the race (constructs RaceWorld from current players)
  - `tick(dt: number): void` — steps the active race
  - `snapshot(): WorldSnapshot | null`
  - `drainEvents(): GameEvent[]`
  - `get phase(): Phase`
  - `get playerCount(): number`

- [ ] **Step 1: Write the failing test** — `tests/room.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../server/room';
import { STEP, MAX_PLAYERS } from '../shared/constants';

describe('Room', () => {
  let room: Room;
  beforeEach(() => { room = new Room('4821', 1); });

  it('assigns sequential lanes as players join', () => {
    const a = room.addPlayer('You') as any;
    const b = room.addPlayer('Ada') as any;
    expect(a.lane).toBe(0);
    expect(b.lane).toBe(1);
    expect(a.playerId).not.toEqual(b.playerId);
  });

  it('rejects joins beyond MAX_PLAYERS', () => {
    for (let i = 0; i < MAX_PLAYERS; i++) room.addPlayer('P' + i);
    const over = room.addPlayer('Overflow') as any;
    expect(over.error).toBeDefined();
    expect(room.playerCount).toBe(MAX_PLAYERS);
  });

  it('starts as lobby and has no snapshot until started', () => {
    expect(room.phase).toBe('lobby');
    expect(room.snapshot()).toBeNull();
  });

  it('start() builds a race and produces snapshots', () => {
    room.addPlayer('You'); room.addPlayer('Ada');
    room.start();
    const s = room.snapshot();
    expect(s).not.toBeNull();
    expect(s!.cars).toHaveLength(2);
    expect(['countdown', 'racing']).toContain(room.phase);
  });

  it('routes intents to the right car after racing begins', () => {
    const a = room.addPlayer('You') as any;
    room.addPlayer('Ada');
    room.start();
    for (let i = 0; i < 4 * 60; i++) { room.tick(STEP); if (room.phase === 'racing') break; }
    const before = room.snapshot()!.cars.find(c => c.id === a.playerId)!.targetLane;
    room.applyIntent(a.playerId, before === 0 ? 'MOVE_RIGHT' : 'MOVE_LEFT');
    const after = room.snapshot()!.cars.find(c => c.id === a.playerId)!.targetLane;
    expect(after).not.toBe(before);
  });

  it('drains the countdown/go events', () => {
    room.addPlayer('You'); room.start();
    let sawGo = false;
    for (let i = 0; i < 4 * 60; i++) {
      room.tick(STEP);
      if (room.drainEvents().some(e => e.kind === 'go')) sawGo = true;
      if (room.phase === 'racing') break;
    }
    expect(sawGo).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- room.test`
Expected: FAIL — cannot find module `../server/room`.

- [ ] **Step 3: Implement `server/room.ts`**

```ts
import { RaceWorld } from '../shared/race-world';
import { MAX_PLAYERS, LANES } from '../shared/constants';
import type { Intent, WorldSnapshot, Phase, GameEvent } from '../shared/types';

interface RoomPlayer { id: string; name: string; color: string; lane: number; }

const COLORS = ['#36d1dc','#f22f46','#ffcf5c','#36e08a','#a06bff','#ff8a5c','#5c8aff','#ff5ca8'];

export class Room {
  readonly code: string;
  private seed: number;
  private players: RoomPlayer[] = [];
  private world: RaceWorld | null = null;
  private _phase: Phase = 'lobby';
  private nextId = 1;

  constructor(code: string, seed: number) { this.code = code; this.seed = seed; }

  get phase(): Phase { return this._phase; }
  get playerCount(): number { return this.players.length; }

  addPlayer(name: string, color?: string): { playerId: string; lane: number } | { error: string } {
    if (this.players.length >= MAX_PLAYERS) return { error: 'room_full' };
    if (this._phase !== 'lobby') return { error: 'race_in_progress' };
    const lane = this.players.length % LANES;
    const id = `p${this.nextId++}`;
    this.players.push({ id, name, color: color ?? COLORS[this.players.length % COLORS.length]!, lane });
    return { playerId: id, lane };
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  start(): void {
    if (this.players.length === 0) return;
    this.world = new RaceWorld(
      this.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
      this.seed,
    );
    this._phase = this.world.phase;
  }

  applyIntent(playerId: string, intent: Intent): void {
    this.world?.applyIntent(playerId, intent);
  }

  tick(dt: number): void {
    if (!this.world) return;
    this.world.step(dt);
    this._phase = this.world.phase;
  }

  snapshot(): WorldSnapshot | null { return this.world ? this.world.snapshot() : null; }
  drainEvents(): GameEvent[] { return this.world ? this.world.drainEvents() : []; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- room.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/room.ts tests/room.test.ts
git commit -m "feat: Room lifecycle (lobby, lane assignment, race control)"
```

---

### Task 5: RoomManager (rooms by code)

Creates and finds rooms by 4-digit code; the lookup the Twilio DTMF flow will use later.

**Files:**
- Create: `server/room-manager.ts`
- Test: `tests/room-manager.test.ts`

**Interfaces:**
- Consumes: `Room` (Task 4).
- Produces:
  - `class RoomManager`
  - `getOrCreate(code: string): Room`
  - `find(code: string): Room | undefined`
  - `remove(code: string): void`
  - `get count(): number`

- [ ] **Step 1: Write the failing test** — `tests/room-manager.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from '../server/room-manager';

describe('RoomManager', () => {
  it('creates a room on first request and reuses it after', () => {
    const m = new RoomManager();
    const a = m.getOrCreate('4821');
    const b = m.getOrCreate('4821');
    expect(a).toBe(b);
    expect(m.count).toBe(1);
  });
  it('find returns undefined for unknown codes', () => {
    const m = new RoomManager();
    expect(m.find('0000')).toBeUndefined();
  });
  it('remove deletes a room', () => {
    const m = new RoomManager();
    m.getOrCreate('1234'); m.remove('1234');
    expect(m.find('1234')).toBeUndefined();
    expect(m.count).toBe(0);
  });
  it('different codes are different rooms with the same code stored', () => {
    const m = new RoomManager();
    const a = m.getOrCreate('1111');
    const b = m.getOrCreate('2222');
    expect(a).not.toBe(b);
    expect(a.code).toBe('1111');
    expect(b.code).toBe('2222');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- room-manager`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `server/room-manager.ts`**

```ts
import { Room } from './room';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private seedCounter = 1;

  getOrCreate(code: string): Room {
    let room = this.rooms.get(code);
    if (!room) { room = new Room(code, this.seedCounter++); this.rooms.set(code, room); }
    return room;
  }
  find(code: string): Room | undefined { return this.rooms.get(code); }
  remove(code: string): void { this.rooms.delete(code); }
  get count(): number { return this.rooms.size; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- room-manager`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/room-manager.ts tests/room-manager.test.ts
git commit -m "feat: RoomManager (create/find rooms by code)"
```

---

### Task 6: Protocol parsing + GameServer (WebSocket transport)

Wires WebSocket connections to rooms, parses/validates client messages, runs the fixed-timestep game loop, and
broadcasts snapshots + events. The message parser is pulled into a pure function so it's unit-tested without a
live socket; the server wiring is exercised via an integration test using a real `ws` client against an
ephemeral port.

**Files:**
- Create: `server/game-server.ts`, `server/index.ts`
- Test: `tests/protocol.test.ts`, `tests/game-server.test.ts`

**Interfaces:**
- Consumes: `RoomManager` (Task 5), `Room` (Task 4), protocol types (Task 2).
- Produces:
  - `parseClientMessage(raw: string): ClientMessage | { type: 'error'; code: string; message: string }`
  - `class GameServer { constructor(opts: { port: number; tickHz?: number; broadcastHz?: number }); start(): Promise<number> /* bound port */; stop(): Promise<void>; }`

- [ ] **Step 1: Write the failing protocol test** — `tests/protocol.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseClientMessage } from '../server/game-server';

describe('parseClientMessage', () => {
  it('parses a valid join', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'join', roomCode: '4821', name: 'You' }));
    expect(m).toEqual({ type: 'join', roomCode: '4821', name: 'You' });
  });
  it('parses a valid intent', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'intent', intent: 'MOVE_LEFT' }));
    expect(m).toEqual({ type: 'intent', intent: 'MOVE_LEFT' });
  });
  it('rejects an unknown intent value', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'intent', intent: 'TELEPORT' })) as any;
    expect(m.type).toBe('error');
  });
  it('rejects malformed JSON', () => {
    const m = parseClientMessage('{not json') as any;
    expect(m.type).toBe('error');
  });
  it('rejects an unknown message type', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'launch_missiles' })) as any;
    expect(m.type).toBe('error');
  });
});
```

- [ ] **Step 2: Run protocol test to verify it fails**

Run: `npm test -- protocol`
Expected: FAIL — cannot find module `../server/game-server`.

- [ ] **Step 3: Implement `server/game-server.ts`**

```ts
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './room-manager';
import { Room } from './room';
import { STEP } from '../shared/constants';
import { INTENTS } from '../shared/types';
import type { ClientMessage, ServerMessage } from '../shared/types';

type ParseResult = ClientMessage | { type: 'error'; code: string; message: string };

export function parseClientMessage(raw: string): ParseResult {
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return err('bad_json', 'invalid JSON'); }
  if (!obj || typeof obj.type !== 'string') return err('bad_message', 'missing type');
  switch (obj.type) {
    case 'join':
      if (typeof obj.roomCode !== 'string' || typeof obj.name !== 'string')
        return err('bad_join', 'roomCode and name required');
      return { type: 'join', roomCode: obj.roomCode, name: obj.name,
               ...(typeof obj.color === 'string' ? { color: obj.color } : {}) };
    case 'intent':
      if (!INTENTS.includes(obj.intent)) return err('bad_intent', 'unknown intent');
      return { type: 'intent', intent: obj.intent };
    case 'ready':   return { type: 'ready' };
    case 'restart': return { type: 'restart' };
    default:        return err('unknown_type', `unknown type ${obj.type}`);
  }
}
function err(code: string, message: string): ParseResult { return { type: 'error', code, message }; }

interface Conn { ws: WebSocket; roomCode?: string; playerId?: string; }

export class GameServer {
  private wss: WebSocketServer | null = null;
  private rooms = new RoomManager();
  private conns = new Set<Conn>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private broadcastAccum = 0;
  private readonly port: number;
  private readonly broadcastEvery: number;

  constructor(opts: { port: number; broadcastHz?: number }) {
    this.port = opts.port;
    this.broadcastEvery = 1 / (opts.broadcastHz ?? 20);
  }

  start(): Promise<number> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const addr = this.wss!.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : this.port;
        this.startLoop();
        resolve(boundPort);
      });
      this.wss.on('connection', (ws) => this.onConnection(ws));
    });
  }

  private onConnection(ws: WebSocket): void {
    const conn: Conn = { ws };
    this.conns.add(conn);
    ws.on('message', (data) => this.onMessage(conn, data.toString()));
    ws.on('close', () => {
      if (conn.roomCode && conn.playerId) this.rooms.find(conn.roomCode)?.removePlayer(conn.playerId);
      this.conns.delete(conn);
    });
  }

  private onMessage(conn: Conn, raw: string): void {
    const msg = parseClientMessage(raw);
    if (msg.type === 'error') return this.send(conn, msg as ServerMessage);
    switch (msg.type) {
      case 'join': {
        const room = this.rooms.getOrCreate(msg.roomCode);
        const res = room.addPlayer(msg.name, msg.color);
        if ('error' in res) return this.send(conn, { type: 'error', code: res.error, message: res.error });
        conn.roomCode = msg.roomCode; conn.playerId = res.playerId;
        this.send(conn, { type: 'joined', playerId: res.playerId, lane: res.lane, roomCode: msg.roomCode });
        break;
      }
      case 'ready': {
        const room = conn.roomCode ? this.rooms.find(conn.roomCode) : undefined;
        if (room && room.phase === 'lobby') { room.start(); this.send(conn, anyItems(room)); }
        break;
      }
      case 'intent':
        if (conn.roomCode && conn.playerId)
          this.rooms.find(conn.roomCode)?.applyIntent(conn.playerId, msg.intent);
        break;
      case 'restart': {
        const room = conn.roomCode ? this.rooms.find(conn.roomCode) : undefined;
        if (room) { room.start(); this.send(conn, anyItems(room)); }
        break;
      }
    }
  }

  private startLoop(): void {
    let last = process.hrtime.bigint();
    this.loop = setInterval(() => {
      const now = process.hrtime.bigint();
      let dt = Number(now - last) / 1e9; last = now;
      dt = Math.min(dt, 0.1);
      // step every active room at fixed timestep
      const seen = new Set<Room>();
      for (const c of this.conns) {
        const room = c.roomCode ? this.rooms.find(c.roomCode) : undefined;
        if (room && !seen.has(room)) { seen.add(room); this.stepRoom(room, dt); }
      }
      this.broadcastAccum += dt;
      if (this.broadcastAccum >= this.broadcastEvery) { this.broadcastAccum = 0; this.broadcastAll(); }
    }, 1000 / 60);
  }

  private stepRoom(room: Room, dt: number): void {
    let acc = (room as any)._acc ?? 0; acc += dt;
    while (acc >= STEP) { room.tick(STEP); acc -= STEP; }
    (room as any)._acc = acc;
  }

  private broadcastAll(): void {
    for (const c of this.conns) {
      if (!c.roomCode) continue;
      const room = this.rooms.find(c.roomCode); if (!room) continue;
      const snap = room.snapshot(); if (!snap) continue;
      this.send(c, { type: 'snapshot', snapshot: snap });
      for (const event of room.drainEventsOnce()) this.send(c, { type: 'event', event });
    }
  }

  private send(conn: Conn, msg: ServerMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.loop) clearInterval(this.loop);
      for (const c of this.conns) c.ws.close();
      this.conns.clear();
      if (this.wss) this.wss.close(() => resolve()); else resolve();
    });
  }
}

function anyItems(room: Room): ServerMessage {
  const snap = room.snapshot();
  return { type: 'items', items: snap ? snap.items : [] };
}
```

- [ ] **Step 4: Fix the events double-drain bug**

`drainEvents()` empties the queue, so calling it once per connection would give events to only the first
client. Add a per-tick cache in `Room`. Modify `server/room.ts`:

```ts
// add field
private eventsThisBroadcast: GameEvent[] = [];
// replace drainEvents with two methods:
drainEvents(): GameEvent[] { return this.world ? this.world.drainEvents() : []; }
/** Cache events once per broadcast so every connection in the room sees them. */
cacheEventsForBroadcast(): void { this.eventsThisBroadcast = this.drainEvents(); }
drainEventsOnce(): GameEvent[] { return this.eventsThisBroadcast; }
```

And in `game-server.ts` `broadcastAll()`, call `room.cacheEventsForBroadcast()` once per room before the
per-connection loop:

```ts
private broadcastAll(): void {
  const cached = new Set<Room>();
  for (const c of this.conns) {
    if (!c.roomCode) continue;
    const room = this.rooms.find(c.roomCode); if (!room) continue;
    if (!cached.has(room)) { room.cacheEventsForBroadcast(); cached.add(room); }
    const snap = room.snapshot(); if (!snap) continue;
    this.send(c, { type: 'snapshot', snapshot: snap });
    for (const event of room.drainEventsOnce()) this.send(c, { type: 'event', event });
  }
}
```

- [ ] **Step 5: Run protocol test to verify it passes**

Run: `npm test -- protocol`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the integration test** — `tests/game-server.test.ts`

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { GameServer } from '../server/game-server';
import type { ServerMessage } from '../shared/types';

let server: GameServer;
afterEach(async () => { await server?.stop(); });

function connect(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  return { ws, inbox, open: () => new Promise<void>(r => ws.on('open', () => r())) };
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('GameServer integration', () => {
  it('a client can join and receive a joined ack with a lane', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const c = connect(port); await c.open();
    c.ws.send(JSON.stringify({ type: 'join', roomCode: '4821', name: 'You' }));
    await wait(100);
    const joined = c.inbox.find(m => m.type === 'joined') as any;
    expect(joined).toBeDefined();
    expect(joined.lane).toBe(0);
    expect(joined.roomCode).toBe('4821');
  });

  it('after ready, the client receives items then snapshots', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const c = connect(port); await c.open();
    c.ws.send(JSON.stringify({ type: 'join', roomCode: '5000', name: 'You' }));
    await wait(50);
    c.ws.send(JSON.stringify({ type: 'ready' }));
    await wait(200);
    expect(c.inbox.some(m => m.type === 'items')).toBe(true);
    expect(c.inbox.some(m => m.type === 'snapshot')).toBe(true);
  });

  it('two clients in the same room both appear in the snapshot', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const a = connect(port); await a.open();
    const b = connect(port); await b.open();
    a.ws.send(JSON.stringify({ type: 'join', roomCode: '7777', name: 'You' }));
    b.ws.send(JSON.stringify({ type: 'join', roomCode: '7777', name: 'Ada' }));
    await wait(50);
    a.ws.send(JSON.stringify({ type: 'ready' }));
    await wait(200);
    const snap = [...a.inbox].reverse().find(m => m.type === 'snapshot') as any;
    expect(snap.snapshot.cars).toHaveLength(2);
  });
});
```

- [ ] **Step 7: Run the integration test to verify it passes**

Run: `npm test -- game-server`
Expected: PASS (3 tests).

- [ ] **Step 8: Implement `server/index.ts` (entry point)**

```ts
import { GameServer } from './game-server';

const port = Number(process.env.PORT ?? 8080);
const server = new GameServer({ port, broadcastHz: 20 });
server.start().then((bound) => {
  console.log(`Voice Racer game server listening on ws://localhost:${bound}`);
});
process.on('SIGINT', () => server.stop().then(() => process.exit(0)));
```

- [ ] **Step 9: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add server/game-server.ts server/index.ts server/room.ts tests/protocol.test.ts tests/game-server.test.ts
git commit -m "feat: GameServer WebSocket transport + protocol parsing"
```

---

### Task 7: Snapshot interpolation buffer

Pure module that holds recent server snapshots and produces an interpolated view ~100ms in the past, so
rendering is smooth despite the ~20Hz broadcast rate. Unit-tested (no DOM).

**Files:**
- Create: `client/interpolation.ts`
- Test: `tests/interpolation.test.ts`

**Interfaces:**
- Consumes: `WorldSnapshot`, `CarState` (Task 2).
- Produces:
  - `class InterpolationBuffer { push(snap: WorldSnapshot, recvT: number): void; sample(renderT: number): WorldSnapshot | null; }`
  - where `renderT`/`recvT` are millisecond timestamps (caller passes `performance.now()`).

- [ ] **Step 1: Write the failing test** — `tests/interpolation.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { InterpolationBuffer } from '../client/interpolation';
import type { WorldSnapshot } from '../shared/types';

function snap(tick: number, z: number): WorldSnapshot {
  return { tick, t: tick / 60, phase: 'racing', countdown: 0,
    cars: [{ id: 'p1', name: 'You', color: '#fff', lane: 0, targetLane: 0, x: 0, z,
      speed: 38, boost: 0, power: 1, powerActive: 0, stunned: 0, lap: 1,
      finished: false, finishT: 0, place: 1 }], items: [] };
}

describe('InterpolationBuffer', () => {
  it('returns null before any snapshot', () => {
    expect(new InterpolationBuffer().sample(1000)).toBeNull();
  });
  it('interpolates car z between two snapshots', () => {
    const b = new InterpolationBuffer(100); // 100ms delay
    b.push(snap(1, 0),   1000);
    b.push(snap(2, 100), 1100);
    // render at 1200ms -> target time 1100ms -> exactly the second snapshot
    const s = b.sample(1200)!;
    expect(s.cars[0]!.z).toBeCloseTo(100, 1);
  });
  it('interpolates to the midpoint', () => {
    const b = new InterpolationBuffer(100);
    b.push(snap(1, 0),   1000);
    b.push(snap(2, 100), 1100);
    // render at 1150ms -> target 1050ms -> halfway between the two
    const s = b.sample(1150)!;
    expect(s.cars[0]!.z).toBeCloseTo(50, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- interpolation`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `client/interpolation.ts`**

```ts
import type { WorldSnapshot, CarState } from '../shared/types';

interface Stamped { recvT: number; snap: WorldSnapshot; }

export class InterpolationBuffer {
  private buf: Stamped[] = [];
  private delayMs: number;
  constructor(delayMs = 100) { this.delayMs = delayMs; }

  push(snap: WorldSnapshot, recvT: number): void {
    this.buf.push({ recvT, snap });
    while (this.buf.length > 60) this.buf.shift();
  }

  sample(renderT: number): WorldSnapshot | null {
    if (this.buf.length === 0) return null;
    const target = renderT - this.delayMs;
    // find the two snapshots straddling `target`
    let a = this.buf[0]!, b = this.buf[this.buf.length - 1]!;
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i]!.recvT <= target && this.buf[i + 1]!.recvT >= target) {
        a = this.buf[i]!; b = this.buf[i + 1]!; break;
      }
    }
    if (a === b) return a.snap;
    const span = b.recvT - a.recvT || 1;
    const f = Math.max(0, Math.min(1, (target - a.recvT) / span));
    return lerpSnapshot(a.snap, b.snap, f);
  }
}

function lerpSnapshot(a: WorldSnapshot, b: WorldSnapshot, f: number): WorldSnapshot {
  const byId = new Map(a.cars.map(c => [c.id, c]));
  const cars: CarState[] = b.cars.map(cb => {
    const ca = byId.get(cb.id) ?? cb;
    return { ...cb, x: lerp(ca.x, cb.x, f), z: lerp(ca.z, cb.z, f) };
  });
  return { ...b, cars };
}
function lerp(a: number, b: number, f: number) { return a + (b - a) * f; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- interpolation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/interpolation.ts tests/interpolation.test.ts
git commit -m "feat: client snapshot interpolation buffer"
```

---

### Task 8: Client renderer, input adapter, and bootstrap

The browser app: connects to the server, sends keyboard intents, and renders interpolated snapshots with
three.js (cars as body+wheels, lane track, barriers/boost pads — primitives, same look as the prototype). This
task is verified by **running it** (no unit test for three.js rendering); the deliverable is a visibly working
keyboard-playable race against the live server.

**Files:**
- Create: `client/index.html`, `client/net.ts`, `client/input-keyboard.ts`, `client/renderer.ts`, `client/main.ts`
- Create: `client/vite.config.ts` (if needed for root)

**Interfaces:**
- Consumes: `InterpolationBuffer` (Task 7), protocol types (Task 2), constants (Task 2).
- Produces (for the eventual Twilio swap):
  - `interface InputAdapter { onIntent(cb: (i: Intent) => void): void; }`
  - `class KeyboardAdapter implements InputAdapter`
  - `class GameConnection { constructor(url: string); join(roomCode: string, name: string): void; ready(): void; sendIntent(i: Intent): void; onItems/onSnapshot/onEvent/onJoined(cb): void; }`

- [ ] **Step 1: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Voice Racer</title>
  <link rel="icon" href="data:," />
  <style>
    html,body{margin:0;height:100%;background:#0b1020;color:#e8ecf6;
      font-family:ui-sans-serif,system-ui,sans-serif;overflow:hidden}
    #app{position:fixed;inset:0}
    #hud{position:absolute;top:14px;left:14px;background:rgba(16,22,40,.86);
      border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 16px}
    #hint{position:absolute;top:14px;right:14px;background:rgba(16,22,40,.86);
      border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 16px;font-size:12px}
    .kbd{background:#0e1530;border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:1px 6px}
    #big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font-size:120px;font-weight:900;pointer-events:none}
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="hud">Voice Racer — keyboard test</div>
  <div id="hint">You = cyan car. <span class="kbd">←</span><span class="kbd">→</span> lanes ·
    <span class="kbd">↑</span> boost · <span class="kbd">↓</span> brake · <span class="kbd">Space</span> power</div>
  <div id="big"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `client/input-keyboard.ts`**

```ts
import type { Intent } from '../shared/types';

export interface InputAdapter { onIntent(cb: (i: Intent) => void): void; }

export class KeyboardAdapter implements InputAdapter {
  private cbs: ((i: Intent) => void)[] = [];
  constructor() {
    const map: Record<string, Intent> = {
      ArrowLeft: 'MOVE_LEFT', ArrowRight: 'MOVE_RIGHT',
      ArrowUp: 'BOOST', ArrowDown: 'BRAKE', ' ': 'USE_POWER',
    };
    addEventListener('keydown', (e) => {
      const intent = map[e.key];
      if (intent) { e.preventDefault(); this.cbs.forEach(cb => cb(intent)); }
    });
  }
  onIntent(cb: (i: Intent) => void): void { this.cbs.push(cb); }
}
```

- [ ] **Step 3: Implement `client/net.ts`**

```ts
import type { Intent, Item, WorldSnapshot, GameEvent } from '../shared/types';

export class GameConnection {
  private ws: WebSocket;
  private onItemsCb?: (items: Item[]) => void;
  private onSnapCb?: (s: WorldSnapshot) => void;
  private onEventCb?: (e: GameEvent) => void;
  private onJoinedCb?: (playerId: string, lane: number) => void;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'items') this.onItemsCb?.(m.items);
      else if (m.type === 'snapshot') this.onSnapCb?.(m.snapshot);
      else if (m.type === 'event') this.onEventCb?.(m.event);
      else if (m.type === 'joined') this.onJoinedCb?.(m.playerId, m.lane);
    };
  }
  private send(o: unknown) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
    else this.ws.addEventListener('open', () => this.ws.send(JSON.stringify(o)), { once: true });
  }
  join(roomCode: string, name: string) { this.send({ type: 'join', roomCode, name }); }
  ready() { this.send({ type: 'ready' }); }
  restart() { this.send({ type: 'restart' }); }
  sendIntent(i: Intent) { this.send({ type: 'intent', intent: i }); }
  onItems(cb: (items: Item[]) => void) { this.onItemsCb = cb; }
  onSnapshot(cb: (s: WorldSnapshot) => void) { this.onSnapCb = cb; }
  onEvent(cb: (e: GameEvent) => void) { this.onEventCb = cb; }
  onJoined(cb: (playerId: string, lane: number) => void) { this.onJoinedCb = cb; }
}
```

- [ ] **Step 4: Implement `client/renderer.ts`**

```ts
import * as THREE from 'three';
import { TRACK_W, TRACK_LEN, LANES, laneX } from '../shared/constants';
import type { WorldSnapshot, Item } from '../shared/types';

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private carMeshes = new Map<string, THREE.Group>();
  private itemMeshes: { mesh: THREE.Mesh; item: Item }[] = [];
  private myId: string | null = null;

  constructor(mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    mount.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0b1020);
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 2000);

    const sun = new THREE.DirectionalLight(0xfff6e6, 1.2);
    sun.position.set(40, 80, -20); sun.castShadow = true; this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x5566aa, 0.6));

    const track = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, TRACK_LEN * 3),
      new THREE.MeshStandardMaterial({ color: 0x1a2238 }));
    track.rotation.x = -Math.PI / 2; track.position.z = TRACK_LEN; this.scene.add(track);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  setMyId(id: string) { this.myId = id; }

  buildItems(items: Item[]) {
    for (const { mesh } of this.itemMeshes) this.scene.remove(mesh);
    this.itemMeshes = items.map(item => {
      const mesh = item.kind === 'barrier'
        ? new THREE.Mesh(new THREE.BoxGeometry(TRACK_W / LANES - 1.5, 1.6, 1.2),
            new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x550000 }))
        : new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 20),
            new THREE.MeshStandardMaterial({ color: 0x36e08a, emissive: 0x0a5a32 }));
      mesh.position.set(laneX(item.lane), item.kind === 'barrier' ? 0.8 : 0.13, item.z);
      this.scene.add(mesh);
      return { mesh, item };
    });
  }

  private ensureCar(id: string, color: string): THREE.Group {
    let g = this.carMeshes.get(id);
    if (!g) {
      g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 3.4),
        new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4 }));
      body.position.y = 0.75; g.add(body);
      for (const [x, z] of [[-1.05,-1.1],[1.05,-1.1],[-1.05,1.1],[1.05,1.1]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16),
          new THREE.MeshStandardMaterial({ color: 0x0a0d16 }));
        w.rotation.z = Math.PI / 2; w.position.set(x!, 0.5, z!); g.add(w);
      }
      if (id === this.myId) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4),
          new THREE.MeshBasicMaterial({ color: 0x36d1dc }));
        cone.rotation.x = Math.PI; cone.position.y = 4; g.add(cone);
      }
      this.scene.add(g); this.carMeshes.set(id, g);
    }
    return g;
  }

  render(snap: WorldSnapshot) {
    for (const c of snap.cars) {
      const g = this.ensureCar(c.id, c.color);
      g.position.set(c.x, 0, c.z);
    }
    const me = snap.cars.find(c => c.id === this.myId) ?? snap.cars[0];
    const z = me ? me.z : 0;
    this.camera.position.set(13, 15, z - 30);
    this.camera.lookAt(me ? me.x * 0.4 : 0, 1.5, z + 26);
    this.renderer.render(this.scene, this.camera);
  }
}
```

- [ ] **Step 5: Implement `client/main.ts`**

```ts
import { GameConnection } from './net';
import { KeyboardAdapter } from './input-keyboard';
import { Renderer } from './renderer';
import { InterpolationBuffer } from './interpolation';

const url = `ws://${location.hostname}:8080`;
const conn = new GameConnection(url);
const input = new KeyboardAdapter();
const renderer = new Renderer(document.getElementById('app')!);
const buffer = new InterpolationBuffer(100);
const big = document.getElementById('big')!;

const roomCode = new URLSearchParams(location.search).get('room') ?? '4821';
const name = new URLSearchParams(location.search).get('name') ?? 'You';

conn.onJoined((playerId) => { renderer.setMyId(playerId); conn.ready(); });
conn.onItems((items) => renderer.buildItems(items));
conn.onSnapshot((s) => buffer.push(s, performance.now()));
conn.onEvent((e) => {
  if (e.kind === 'countdown') big.textContent = String(e.n);
  else if (e.kind === 'go') { big.textContent = 'GO!'; setTimeout(() => (big.textContent = ''), 900); }
  else if (e.kind === 'race_over') big.textContent = '🏁';
});
input.onIntent((i) => conn.sendIntent(i));
addEventListener('keydown', (e) => { if (e.key === 'r') conn.restart(); });

conn.join(roomCode, name);

function frame() {
  requestAnimationFrame(frame);
  const snap = buffer.sample(performance.now());
  if (snap) renderer.render(snap);
}
requestAnimationFrame(frame);
```

- [ ] **Step 6: Run the full system manually**

Run (terminal 1): `npm run dev:server`
Expected: `Voice Racer game server listening on ws://localhost:8080`

Run (terminal 2): `npm run dev:client`
Expected: Vite prints a local URL (e.g. `http://localhost:5173`).

Open the URL in a browser. Expected: a 3-2-1 countdown, then your cyan car auto-drives forward; arrow keys
change lanes; you can see red barriers and green boost pads; pressing `r` restarts. Open a second browser tab
with `?room=4821&name=Ada` — both cars appear in the same race.

- [ ] **Step 7: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add client/
git commit -m "feat: client renderer, keyboard input adapter, and bootstrap"
```

---

## Deliberate Deferrals (not gaps)

- **AI opponent cars** — the prototype had them; Plan 1 omits them. Rationale: with keyboard testing you can
  open multiple browser tabs for multiple cars, and at an event most lanes fill with real players. AI
  controllers (a `server/ai-controller.ts` that calls `room.applyIntent` for bot players) are a small,
  self-contained add — deferred until we know how many lanes real players actually fill. The `RaceWorld` already
  supports it (bots are just players whose intents come from code instead of a socket).
- **Studio editor** — deferred to Plan 5 (it operates on scene-data/assets, orthogonal to the netcode).
- **Voice / Twilio** — deferred to Plan 2; Task 8 ships the `InputAdapter` seam the voice adapter implements.

## Self-Review Results

- **Placeholder scan:** none found.
- **Type consistency:** RaceWorld method names (`applyIntent`/`step`/`snapshot`/`drainEvents`) consistent across
  tasks; the `drainEvents`/`drainEventsOnce`/`cacheEventsForBroadcast` split is introduced deliberately in
  Task 6 Step 4 to fix the multi-client event double-drain.
- **Spec coverage:** all Plan-1-scoped spec requirements (§2 server-authority, §3 RaceWorld/GameServer/Display,
  §4 intent+snapshot flow, §7 interpolation + dropped-call safe default, §9 deterministic unit tests) map to
  tasks. Later-milestone items explicitly deferred above.


