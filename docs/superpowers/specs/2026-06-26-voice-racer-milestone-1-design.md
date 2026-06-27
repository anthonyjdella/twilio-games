# Voice Racer — Milestone 1 Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Prototype:** validated in `prototype/` (single-file three.js) — gameplay is fun, survives voice-level latency.

---

## 1. Purpose & Scope

**What this is:** A voice-controlled multiplayer party racing game for live events, the first game in a
platform that showcases Twilio products. Up to 8 players, physically together in one room, control cars on a
single shared display by speaking commands into their phones over Twilio.

**The game:** A lane-based "dodge-and-grab" racer (endless-runner style). Cars auto-drive forward at speed.
Players steer between 3 lanes by voice ("left", "right") to **dodge red barriers** (which stun/slow them) and
**grab green boost pads** (which speed them up). First across the finish line wins. Boost/brake and a one-shot
power-up round it out. The track is a straight ribbon passing through themed visual zones — no turning track
(lane-based voice control mismatches continuous-steering geometry).

**Milestone 1 delivers:**
- The full lane racer playable by up to 8 people via voice on one shared display
- Server-authoritative multiplayer simulation
- All three Twilio products, each in the role it is genuinely best at (see §5)
- An AI race announcer/host
- Themed straight zones with real imported 3D car models + props
- The studio editor (creator tool) for placing models, lighting, camera, and zones

**Explicitly NOT in Milestone 1** (later milestones, but architecture must not block them):
- Persistent identity/profiles & cross-game leaderboard (Milestone 2)
- Avatar selfie upload via MMS (Milestone 2+)
- Analytics, lead capture, promo comms pipeline (Milestone 3)
- Online / globally-synced play with remote players (Milestone 4)

**Success criteria:** At an event, 8 strangers can register, join, and play a complete voice-controlled race
on a shared screen that reliably "wows a crowd in 3 minutes," demonstrating Media Streams, Conversation Relay,
and Agent Connect each doing something visibly impressive.

---

## 2. Architecture Overview

Three cleanly separated layers connected by narrow interfaces. The central principle, validated by the
prototype: **the game consumes abstract INTENTS, never input devices.**

```
┌─────────────────────────────────────────────────────────────┐
│  DISPLAY (browser, three.js)                                  │
│  - Renders authoritative server state (interpolated, 60fps)   │
│  - Studio editor (scene-as-data)                              │
│  - Plays announcer audio out the room speakers                │
└───────────────▲───────────────────────────────────────────────┘
                │  WebSocket: state/events out
┌───────────────┴───────────────────────────────────────────────┐
│  GAME SERVER (Node)                                           │
│  - Authoritative RaceWorld simulation (owns the truth)        │
│  - Lobby/room management, player↔call↔lane mapping            │
│  - Receives intents, broadcasts snapshots, emits announcer cues│
└───────────────▲───────────────────────────────────────────────┘
                │  intents (MOVE_LEFT, BOOST, …) — SAME interface
                │  the keyboard adapter used in the prototype
┌───────────────┴───────────────────────────────────────────────┐
│  VOICE LAYER (Twilio)                                          │
│  - Media Streams: in-race controls (raw audio → STT → intent) │
│  - Conversation Relay: AI announcer (event → LLM → TTS)       │
│  - Agent Connect: SMS concierge (register, remember, assign)  │
└───────────────────────────────────────────────────────────────┘
```

### Why server-authoritative
The browser becomes a renderer of server state; the server runs the real simulation. Required because:
1. **Fairness / anti-cheat** — race logic runs where players can't tamper (matters for a real leaderboard).
2. **Inputs already land there** — all 8 players' voice intents arrive at the server via Twilio; running the
   sim there is the natural single source of truth, eliminating client/server desync bugs.
3. **Online-ready** — the future globally-synced vision (Milestone 4) *requires* server authority; doing it now
   avoids a rewrite.

The `RaceWorld` simulation code is **identical** to the prototype's — written pure, dependency-free, and
fixed-timestep specifically so it can run on either side. We relocate it, not rewrite it. Render-side latency
from network snapshots is hidden by client interpolation (standard online-game technique).

---

## 3. Components & Responsibilities

Each unit has one clear job and a narrow interface.

| # | Component | Responsibility | Inputs → Outputs |
|---|-----------|----------------|------------------|
| 1 | **RaceWorld** (shared sim core) | Fixed-timestep authoritative race simulation | intents + dt → world state snapshots |
| 2 | **GameServer** (Node) | Lobby/rooms, call↔player↔lane mapping, runs RaceWorld, broadcasts state, emits announcer cues | WS hub |
| 3 | **Display** (browser/three.js) | Renders interpolated server snapshots; hosts studio editor; plays announcer audio | server state → pixels |
| 4 | **VoiceControlAdapter** (Media Streams) | Per-player raw-audio socket → streaming STT (vocab-biased) → fires intent on first interim word match | audio → intent |
| 5 | **Announcer** (Conversation Relay) | Receives game events → LLM commentary → premium TTS → room speakers; canned "3-2-1-GO!" sting for sync | event → speech |
| 6 | **Concierge** (Agent Connect, SMS) | Registration/onboarding agent with memory; assigns lanes; optional enriched path alongside DTMF | SMS ↔ player |
| 7 | **StudioEditor** | Scene-as-data editor: place glTF models, lighting, camera, define zones | edits SceneModel JSON |

---

## 4. Data Flow (one race)

```
JOIN:    Player → SMS to Concierge (TAC) → registered/remembered → room code
          (fallback: just dial the number, no SMS needed)
                          ↓
CONNECT: Player calls shared number → DTMF 4-digit room code → assigned a lane
         → bridged into Media Streams socket (carries roomCode/playerId/lane)
                          ↓
RACE:    voice "left" → STT interim match → MOVE_LEFT intent → GameServer → RaceWorld.step()
                                                                    ↓
         RaceWorld snapshot (30-60/s) → WebSocket → Display renders (interpolated)
                                                                    ↓
         game events ("p3 took the lead") → Announcer (CR) → TTS → room speakers
                          ↓
AFTER:   Concierge (TAC) can text result / offer rematch / save score
```

**Intent set:** `MOVE_LEFT`, `MOVE_RIGHT`, `BOOST`, `BRAKE`, `USE_POWER`. Voice vocabulary biased to:
`left, right, boost, brake, use power`.

---

## 5. Twilio Product Roles ("showcase by role")

Each product is mapped to a different interaction modality and moment, so each demonstrates the capability it
is genuinely best at. **Never put Conversation Relay or Agent Connect in the in-race control loop** — both are
turn-based LLM layers (~900–1500 ms) and would make steering feel laggy, making the products look bad.

| Product | Role | Direction / moment | Why it fits |
|---------|------|--------------------|-------------|
| **Media Streams** | In-race controls | Player→Server, during race | Raw audio + own streaming STT, act on *interim* word match → ~250–500 ms. Only option fast enough. |
| **Conversation Relay** | AI announcer/host | AI→room, throughout | CR is LLM-voice with premium TTS + barge-in. Announcer is pure one-way output, so CR's ~1 s turn latency is invisible. |
| **Agent Connect (TAC)** | SMS lobby concierge | AI↔player, before/after | TAC = BYO-LLM agent SDK with memory, tools, human escalation across SMS/voice. A registration concierge that remembers players is its home turf — and the seam where future leaderboard/lead-capture plug in. |

**Voice→intent technical decision (Media Streams over Conversation Relay for controls):** Media Streams hands
the server raw μ-law audio over a WebSocket; the server runs streaming STT biased to the ~6-word command
vocabulary and fires the intent on the **first interim hypothesis** that matches a command word — no
end-of-speech wait. This yields ~250–500 ms vs Conversation Relay's ~900–1500 ms (turn-based + TTS-on-response).

**Call↔player mapping:** One shared phone number. Players enter a 4-digit room code via **DTMF** (reliable in a
noisy room), which assigns a lane. Identity (`roomCode`/`playerId`/`lane`) is injected into the Media Stream via
TwiML `<Parameter>` and read from the stream's `start.customParameters`. Validate `X-Twilio-Signature` on every
webhook and WebSocket upgrade.

**Announcer transport:** Conversation Relay powers the announcer's brain+voice on a dedicated announcer leg;
that audio is piped to the **room speakers** (one synchronized source, full-band, ~5× cheaper than pushing TTS
down 8 phone legs). Sync-critical "3-2-1-GO!" uses a pre-rendered sting; CR handles dynamic banter around it.

**Cost:** ≈ $0.60–0.75 per 8-player, 3-minute race (all three) vs ~$0.35 lean. Acceptable for an event.

---

## 6. Asset & Zone Pipeline

- **Format:** Cars and props imported as glTF/GLB, loaded via three.js `GLTFLoader`, cached.
- **Cars (hero models):** body mesh + named wheel meshes; wheels animated by spinning (same split-model
  technique the prototype uses with primitives). Highest visual payoff — center screen, player identity.
- **Props (zone dressing):** buildings, signs, scenery — placed via the studio editor.
- **Zones:** ranges along the straight track ribbon, each a JSON theme (skybox/lighting, ground material, prop
  set, barrier/boost skins). Editor-authored, hot-swappable. Track stays straight; only dressing + hazards change.
- **Separation:** gameplay data (lanes, item positions, zone boundaries = JSON the sim reads) vs visual dressing
  (which model skins a barrier). Reskin a track entirely in the editor without touching game logic.
- **Graceful fallback:** if a model fails to load, fall back to the primitive — the game never breaks on a bad
  asset.

---

## 7. Latency & Error Handling

- **Control latency:** act on interim STT; client interpolation/prediction smooths ~300–500 ms; lane-easing
  animation (from prototype) further hides it. The latency slider remains as a dev/tuning tool.
- **Dropped call / misrecognition:** the player's car auto-continues straight (safe default); reconnect rebinds
  to the same lane via room code.
- **Product degradation (critical):** the game runs even if CR or TAC is unavailable — canned announcer instead
  of CR, DTMF-only join instead of TAC concierge. The core loop depends ONLY on Media Streams.

---

## 8. Build Order (incremental — always playable)

Each step adds a product in descending order of how essential it is to the core loop, so there is always a
demo-able product and each step has a built-in fallback.

1. **CORE:** server-authoritative RaceWorld + browser renderer + WebSocket + Media Streams voice controls +
   canned "3-2-1-GO!" placeholder announcer. ✅ *8 people can voice-race on the shared screen.*
2. **ANNOUNCER:** swap the canned clip for Conversation Relay live AI host. ✅ *Falls back to canned clip if CR down.*
3. **CONCIERGE:** add Agent Connect SMS registration (DTMF room-code remains the reliable fallback).
   ✅ *Game works without it — players just DTMF a code.*
4. **STUDIO + ASSETS:** import real 3D car models, build themed zones in the editor. (Can proceed in parallel
   once CORE is stable, since it's all scene-data.)

---

## 9. Testing Strategy

- **RaceWorld sim:** pure/deterministic → unit-tested without browser or Twilio.
- **Intent layer:** tested via the keyboard adapter (no Twilio needed for game logic).
- **Voice layer:** recorded audio fixtures → STT → asserted intents.
- **Twilio webhooks:** signed-request fixtures; signature validation tested.

---

## 10. Open Risks

- **Agent Connect GA/beta status + exact SDK package name** must be verified before committing it to a live
  event — it's the riskiest dependency. The DTMF fallback de-risks this (game works without TAC).
- **Real-room STT accuracy** with 8 people talking at once — vocabulary biasing and per-player audio isolation
  (each player on their own call leg) mitigate this; to be validated with real audio fixtures.
- **Cellular last-mile latency** (~50–150 ms, uncontrollable) — game feel is designed to tolerate it (lanes are
  forgiving, not twitch).
