# In-Game AI Announcer + Event HUD — Design

**Date:** 2026-06-27
**Status:** Approved (autonomous build)
**Relation:** Delivers the "AI race host" vision (Milestone 1 §5 announcer role) for the
single-display case WITHOUT Twilio — using the browser's built-in speech synthesis. The
Twilio/Conversation-Relay announcer-down-the-phone remains a future option; this is the
in-room host that plays out the display's speakers, which the architecture always preferred.

## Purpose & Scope

Give the race a spoken, reactive AI host plus an on-screen commentary ticker, driven by the
GameEvents the server already emits (`countdown`, `go`, `lead_change`, `hit`, `finish`,
`race_over`) — which the client currently drops. The host calls the countdown, reacts to
crashes and lead changes, and announces finishers, both as **speech** (Web Speech API
`speechSynthesis`) and as a **HUD ticker**.

**In scope:**
- Pure `commentaryFor(event): string | null` — maps a GameEvent to a spoken/displayed line
  (with variety: multiple phrasings chosen deterministically by a counter so it isn't robotic).
- `Announcer` (client): receives events, speaks via `speechSynthesis` (guarded for absence/
  autoplay), throttles/queues so lines don't stampede, and pushes lines to a HUD ticker.
- HUD ticker: a small on-screen feed of recent commentary lines (so it works even with audio
  muted / before the user has interacted to unlock audio).
- Wire into `client/main.ts`: route ALL events through the announcer (closes the deferred
  "client ignores lead_change/hit/finish" gap), keeping the existing big-text countdown/GO.

**Explicitly NOT in scope:** LLM-generated commentary (canned phrase banks — deterministic,
offline, zero latency, no API), Twilio/phone audio, voice selection UI.

**Success criteria:** During a race the host speaks the countdown, reacts to lead changes/
crashes/finishes, and a ticker shows the lines; commentary is varied; it degrades silently if
`speechSynthesis` is unavailable or audio is locked (ticker still works); commentary generation
is unit-tested. No server/sim change.

## Architecture

- **`client/commentary.ts` (pure):** `commentaryFor(event: GameEvent, seq: number): string | null`
  — phrase banks per event kind; `seq` (an incrementing counter) selects a variant via modulo
  so repeated events vary. Pure, unit-testable. Returns null for events with no line (or to
  intentionally stay quiet, e.g. every countdown tick already shown big).
- **`client/announcer.ts` (shell):** `class Announcer { constructor(opts?: { onLine?: (s:string)=>void }); handle(event: GameEvent): void; setMuted(b): void; }`
  - Keeps a `seq` counter; calls `commentaryFor`; if a line results, (a) invokes `onLine` (HUD)
    and (b) speaks via `speechSynthesis` when available + not muted.
  - **Robustness:** feature-detect `window.speechSynthesis`; wrap in try/catch; cancel-on-new
    for high-priority lines (GO!, finish) so they don't queue behind chatter; a short min-gap
    so rapid `hit` events don't machine-gun. No throw if speech unavailable.
- **HUD ticker (in `main.ts` + `index.html`):** a small fixed panel; `Announcer`'s `onLine`
  prepends lines, capped to the last ~5, auto-fading. A mute toggle (audio starts muted-safe;
  browsers block autoplay until a user gesture — the operator's Enter-to-start counts as the
  gesture, so we (re)enable speech on that interaction).

## Testing

- `commentaryFor` unit-tested (pure): each event kind yields a non-empty string (or null where
  intended); the `seq` counter produces variety (two different seq for the same kind can differ);
  `finish` includes the place/name; unknown/again-safe. Fully offline.
- `Announcer` logic tested with an injected fake speech sink + onLine spy: routes lines to
  onLine; respects muted; doesn't throw when speechSynthesis is absent (inject undefined).
- HUD + real speech verified by build + headless smoke (lines appear; no console errors;
  speechSynthesis calls guarded).

## Risks

- **Autoplay policy blocks speech until a gesture** — mitigated: enable on the operator's
  Enter-to-start gesture; ticker always works regardless. Documented.
- **Speech queue stampede on rapid events** — min-gap + cancel-on-priority in the Announcer.
- **`speechSynthesis` absent (some headless/embedded browsers)** — feature-detected; ticker-only
  fallback; never throws.
