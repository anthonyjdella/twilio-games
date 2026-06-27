# Home / Lobby Landing Page — Design

**Date:** 2026-06-27
**Status:** Approved (autonomous build)
**Relation:** Fulfills the original Milestone-1 ask: "a home page with a selection of games to
pick from" + a place for players to enter their name (the future lead-capture seam). The app
currently boots straight into the racer; this adds the front door.

## Purpose & Scope

A branded landing page that is the app's entry point. It presents the game lineup (Voice Racer
now; "coming soon" placeholders for the 2D fighter / battler ideas), and a join flow:
- **Host this display** → opens the racer as the shared spectator/operator screen.
- **Join as player** (name + 4-digit room code) → opens the racer as a keyboard player (and,
  once live, the same room code players will dial in to via phone).

Twilio brand styling (palette/typography) so it reads as a polished Twilio showcase.

**In scope:**
- `index.html` becomes the **home page**; the racer moves to `play.html` (its logic is
  unchanged — it already reads `room`/`name`/`display` from URL params; only its filename and
  the vite input name change).
- Home page (`home.ts` + markup): game cards (one active, others disabled "coming soon"); a
  join form (name + room code, with a sensible default room); a "Host display" button; an
  "Open model editor" link (dev convenience). Buttons navigate to `play.html?...` with params.
- Twilio-brand visual pass: red `#F22F46`, ink `#121C2D`, off-white bg, system/Inter-ish type,
  rounded cards — tasteful, not garish.
- Input hygiene: name trimmed + length-capped; room code constrained to 4 digits; the
  player-name is URL-encoded into the link.

**Explicitly NOT in scope:** real accounts/auth, persistence/leaderboard, lead-capture backend
(this page is the *seam* for it later — a name field that currently just rides into the game),
SMS, new game implementations.

## Architecture

- **`client/index.html` + `client/home.ts`** — the landing page. Static markup + a small TS
  module that: validates the join form, builds the target URL, and navigates. No game/three.js
  imports (lightweight page). Game lineup is a small data array (`{id, title, blurb, status}`)
  so adding games later is a one-line edit.
- **`client/play.html`** — the former `index.html` (the racer page), renamed. `client/main.ts`
  is unchanged.
- **`client/vite.config.ts`** — rollup inputs become `home: index.html`, `play: play.html`,
  `editor: editor/editor.html`. Dev proxy unchanged.
- **Navigation contract:** Host → `play.html?display=1&room=<code>`; Player →
  `play.html?room=<code>&name=<encoded>`. The racer already honors these params.

## Testing

- Pure URL-building + validation extracted to `client/home-nav.ts` and unit-tested:
  `buildPlayUrl({ mode, roomCode, name })` → correct `play.html?...` string; room code
  sanitized to 4 digits; name trimmed/encoded; invalid inputs produce a safe default. Fully
  offline, no DOM.
- Home page render + navigation verified by build + headless smoke (page loads, cards show,
  join navigates to the right URL, no console errors). The racer still loads at `play.html`.

## Risks

- **Breaking the racer entry by renaming index→play.** Mitigated: the racer code reads params
  the same way; only the file name + vite input change. Smoke-test that `play.html` still runs
  the game and the editor still loads.
- **Scope creep into real lead-capture/auth.** Held off explicitly — the name field is a
  forward seam, not a backend.
