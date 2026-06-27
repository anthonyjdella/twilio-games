# In-Game AI Announcer + Event HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** A spoken, reactive AI race host + on-screen commentary ticker, driven by existing GameEvents, using the browser Web Speech API (no Twilio). Closes the deferred "client ignores lead_change/hit/finish" gap.

**Architecture:** Pure `commentaryFor(event, seq)` maps events to varied lines; `Announcer` speaks them (`speechSynthesis`, guarded) and feeds a HUD ticker; `main.ts` routes all events through it. No server/sim change.

**Tech Stack:** TypeScript strict, browser `speechSynthesis`, Vitest.

## Global Constraints
- ES modules, TS strict, noUncheckedIndexedAccess.
- `client/commentary.ts` is PURE (no DOM/speech) — testable.
- `Announcer` must NOT throw if `speechSynthesis` is absent (feature-detect + try/catch); ticker still works.
- No server/sim change. Existing countdown/GO big-text behavior preserved.
- DRY, YAGNI, TDD, frequent commits.

---

### Task 1: Pure commentary generation

**Files:** Create `client/commentary.ts`, `tests/commentary.test.ts`.

**Interfaces:**
- `commentaryFor(event: GameEvent, seq: number): string | null` (imports `GameEvent` from `../shared/types`).
- `interface SpokenLine { text: string; priority: 'high' | 'normal' }` — actually return just `string | null`; priority is derived in the Announcer by event kind (keep commentary pure-simple).

- [ ] **Step 1: Write the failing test** — `tests/commentary.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { commentaryFor } from '../client/commentary';
import type { GameEvent } from '../shared/types';

describe('commentaryFor', () => {
  it('go is an energetic non-empty line', () => {
    const s = commentaryFor({ kind: 'go' }, 0);
    expect(s).toBeTruthy();
    expect(typeof s).toBe('string');
  });
  it('lead_change names the new leader', () => {
    const s = commentaryFor({ kind: 'lead_change', playerId: 'p2', name: 'Ada' }, 0)!;
    expect(s).toContain('Ada');
  });
  it('finish includes name and place', () => {
    const s = commentaryFor({ kind: 'finish', playerId: 'p1', name: 'Rex', place: 1 }, 0)!;
    expect(s).toContain('Rex');
    expect(s).toMatch(/1|first|1st/i);
  });
  it('hit produces a reaction line', () => {
    expect(commentaryFor({ kind: 'hit', playerId: 'p3' }, 0)).toBeTruthy();
  });
  it('race_over produces a wrap-up line', () => {
    expect(commentaryFor({ kind: 'race_over' }, 0)).toBeTruthy();
  });
  it('varies phrasing by seq for the same kind', () => {
    const a = commentaryFor({ kind: 'go' }, 0);
    const b = commentaryFor({ kind: 'go' }, 1);
    const c = commentaryFor({ kind: 'go' }, 2);
    // at least two of three differ (phrase bank has variety)
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
  it('per-countdown-tick returns null (big-text already shows the number)', () => {
    expect(commentaryFor({ kind: 'countdown', n: 3 }, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- commentary`.

- [ ] **Step 3: Implement `client/commentary.ts`**

```ts
import type { GameEvent } from '../shared/types';

const pick = (arr: string[], seq: number): string => arr[Math.abs(seq) % arr.length]!;

const GO = ['Greeen light — GO GO GO!', 'And they\'re off!', 'Hammer down — GO!', 'Here we go, racers!'];
const HIT = ['Ooh, that\'s gotta hurt!', 'Into the barrier!', 'Crunch! Someone\'s feeling that.',
  'Bumper cars out there!', 'That\'s a costly tap!'];
const LEAD = ['takes the lead!', 'surges to the front!', 'is out in front now!', 'grabs P1!'];
const OVER = ['That\'s the checkered flag!', 'Race over — what a finish!', 'And that\'s a wrap, folks!'];

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function commentaryFor(event: GameEvent, seq: number): string | null {
  switch (event.kind) {
    case 'go':          return pick(GO, seq);
    case 'hit':         return pick(HIT, seq);
    case 'lead_change': return `${event.name} ${pick(LEAD, seq)}`;
    case 'finish':      return event.place === 1
      ? `${event.name} wins it! 🏁`
      : `${event.name} finishes ${ordinal(event.place)}.`;
    case 'race_over':   return pick(OVER, seq);
    case 'countdown':   return null;   // the big-text overlay already shows the number
    default:            return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- commentary` (7 tests).

- [ ] **Step 5: Typecheck + commit**
```bash
git add client/commentary.ts tests/commentary.test.ts
git commit -m "feat: pure race-commentary generation with phrase variety"
```

---

### Task 2: Announcer (speech + ticker) — logic unit-tested, shell verified by run

**Files:** Create `client/announcer.ts`, `tests/announcer.test.ts`.

**Interfaces:**
- Consumes `commentaryFor` (Task 1), `GameEvent`.
- `interface SpeechSink { speak(text: string, opts: { priority: boolean }): void }` — abstraction over `speechSynthesis` so it's testable.
- `class Announcer { constructor(deps: { sink?: SpeechSink | null; onLine?: (text: string) => void }); handle(event: GameEvent): void; setMuted(m: boolean): void; }`
  - high-priority kinds (`go`, `finish`, `race_over`) pass `priority:true`; others normal.
  - if muted or no sink, still calls `onLine` (ticker works without audio).

- [ ] **Step 1: Write the failing test** — `tests/announcer.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { Announcer } from '../client/announcer';

function setup() {
  const spoken: { text: string; priority: boolean }[] = [];
  const lines: string[] = [];
  const sink = { speak: (text: string, opts: { priority: boolean }) => spoken.push({ text, priority: opts.priority }) };
  const a = new Announcer({ sink, onLine: (t) => lines.push(t) });
  return { a, spoken, lines };
}

describe('Announcer', () => {
  it('speaks and tickers a line for an event with commentary', () => {
    const { a, spoken, lines } = setup();
    a.handle({ kind: 'lead_change', playerId: 'p1', name: 'Ada' });
    expect(spoken).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Ada');
  });
  it('does NOT speak/ticker events with no commentary (countdown tick)', () => {
    const { a, spoken, lines } = setup();
    a.handle({ kind: 'countdown', n: 3 });
    expect(spoken).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
  it('marks go/finish/race_over as high priority', () => {
    const { a, spoken } = setup();
    a.handle({ kind: 'go' });
    expect(spoken[0]!.priority).toBe(true);
  });
  it('when muted, still tickers but does not speak', () => {
    const { a, spoken, lines } = setup();
    a.setMuted(true);
    a.handle({ kind: 'go' });
    expect(spoken).toHaveLength(0);
    expect(lines).toHaveLength(1);
  });
  it('does not throw when there is no speech sink (headless / unsupported)', () => {
    const lines: string[] = [];
    const a = new Announcer({ sink: null, onLine: (t) => lines.push(t) });
    expect(() => a.handle({ kind: 'go' })).not.toThrow();
    expect(lines).toHaveLength(1);   // ticker still works
  });
  it('varies repeated lines (seq advances)', () => {
    const { a, lines } = setup();
    a.handle({ kind: 'hit', playerId: 'p1' });
    a.handle({ kind: 'hit', playerId: 'p1' });
    a.handle({ kind: 'hit', playerId: 'p1' });
    expect(new Set(lines).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- announcer`.

- [ ] **Step 3: Implement `client/announcer.ts`**

```ts
import type { GameEvent } from '../shared/types';
import { commentaryFor } from './commentary';

export interface SpeechSink { speak(text: string, opts: { priority: boolean }): void; }

const HIGH_PRIORITY = new Set<GameEvent['kind']>(['go', 'finish', 'race_over']);

export class Announcer {
  private seq = 0;
  private muted = false;
  private sink: SpeechSink | null;
  private onLine?: (text: string) => void;

  constructor(deps: { sink?: SpeechSink | null; onLine?: (text: string) => void }) {
    this.sink = deps.sink ?? null;
    this.onLine = deps.onLine;
  }

  setMuted(m: boolean): void { this.muted = m; }

  handle(event: GameEvent): void {
    const line = commentaryFor(event, this.seq);
    if (line === null) return;
    this.seq++;
    this.onLine?.(line);
    if (this.muted || !this.sink) return;
    try { this.sink.speak(line, { priority: HIGH_PRIORITY.has(event.kind) }); }
    catch { /* speech failure must never break the game */ }
  }
}

/** Build a SpeechSink over the browser speechSynthesis, or null if unavailable. */
export function browserSpeechSink(): SpeechSink | null {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return null;
  let lastAt = 0;
  return {
    speak(text, opts) {
      try {
        const now = performance.now();
        // priority lines cancel the queue; normal lines respect a small min-gap
        if (opts.priority) synth.cancel();
        else if (now - lastAt < 700) return;
        lastAt = now;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05; u.pitch = 1.0;
        synth.speak(u);
      } catch { /* ignore */ }
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- announcer` (6 tests).

- [ ] **Step 5: Typecheck + commit**
```bash
git add client/announcer.ts tests/announcer.test.ts
git commit -m "feat: Announcer (speech sink + ticker routing, graceful no-speech fallback)"
```

---

### Task 3: Wire the announcer + ticker HUD into the client

**Files:** Modify `client/main.ts`, `client/index.html`.

- [ ] **Step 1: Add a ticker panel + mute button to `client/index.html`**

Add near the existing HUD:
```html
<div id="ticker" style="position:absolute;left:14px;bottom:14px;width:320px;display:flex;flex-direction:column-reverse;gap:4px;font-family:system-ui,sans-serif;pointer-events:none"></div>
<button id="mute" style="position:absolute;right:14px;bottom:14px;background:rgba(16,22,40,.9);color:#e8ecf6;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 10px;cursor:pointer">🔊 Host</button>
```
(styling can match existing HUD; keep it minimal.)

- [ ] **Step 2: Wire in `client/main.ts`**

```ts
import { Announcer, browserSpeechSink } from './announcer';
// ...
const tickerEl = document.getElementById('ticker')!;
function pushLine(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = 'background:rgba(16,22,40,.85);color:#e8ecf6;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;font-size:13px';
  tickerEl.prepend(div);
  while (tickerEl.children.length > 5) tickerEl.lastChild!.remove();
  setTimeout(() => div.remove(), 6000);
}
const announcer = new Announcer({ sink: browserSpeechSink(), onLine: pushLine });
// start muted-safe; unlock audio on the first user gesture (Enter-to-start counts)
announcer.setMuted(true);
let hostOn = false;
function enableHost() { if (!hostOn) { hostOn = true; announcer.setMuted(false); } }
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
muteBtn.addEventListener('click', () => {
  hostOn = !hostOn; announcer.setMuted(!hostOn);
  muteBtn.textContent = hostOn ? '🔊 Host' : '🔇 Host';
});
```
In the EXISTING `addEventListener('keydown', ...)` that handles Enter-to-start, also call
`enableHost()` (the Enter gesture unlocks browser audio). And in the EXISTING `conn.onEvent`
handler, ADD `announcer.handle(e)` (keep the big-text countdown/GO lines as they are):
```ts
conn.onEvent((e) => {
  announcer.handle(e);                         // NEW: speak + ticker
  if (e.kind === 'countdown') big.textContent = String(e.n);
  else if (e.kind === 'go') { big.textContent = 'GO!'; setTimeout(() => (big.textContent = ''), 900); }
  else if (e.kind === 'race_over') big.textContent = '🏁';
});
```

- [ ] **Step 3: Typecheck + build** — `npm run typecheck && npm run build` clean.

- [ ] **Step 4: Headless smoke** — start server + vite, load `?display=1&room=4821`, run a race;
confirm: no console errors, ticker lines appear as events fire (countdown→GO→… ), the mute
button toggles, and `speechSynthesis` calls are guarded (headless has no audio — must not throw).
Confirm game still runs with no manifest. Report observations. Kill servers.

- [ ] **Step 5: Full suite + commit**
Run: `npm test` (96 + commentary + announcer ≈ 109 pass).
```bash
git add client/main.ts client/index.html
git commit -m "feat: wire AI announcer + commentary ticker into the display"
```

---

## Self-Review
(author check below)
