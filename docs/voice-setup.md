# Voice Setup — Live Phone Test Runbook

This is the runbook for the one step that needs a real phone + your Twilio account:
**Plan 2, Task 8** — confirm voice controls work end-to-end and tune latency.

Everything else in Plan 2 is built and unit/integration-tested offline (67 passing tests).
This step is a *tuning* session, not a debugging one: the goal is to feel the real
Conversation Relay latency and adjust the game pace so calling a move feels fair.

---

## What you need

- A **Twilio account** with: Account SID, Auth Token, and a **voice-capable phone number**.
- A way to expose `localhost:8080` to the public internet over **HTTPS** (Twilio requires it).
  You do **not** need ngrok specifically — see options below.
- Node installed (already set up in this repo).

---

## Step 1 — Expose the server over HTTPS (pick ONE)

Twilio must reach your machine at a public `https://` URL (the WebSocket uses the same
host as `wss://`). Any of these work — use whatever you have access to:

### Option A — Cloudflare Tunnel (free, no account for quick tunnels)
```
brew install cloudflared        # or download from Cloudflare
cloudflared tunnel --url http://localhost:8080
```
Copy the printed `https://<random>.trycloudflare.com` URL.

### Option B — VS Code port forwarding (built in, likely already available)
1. In VS Code: open the **Ports** panel (View → Ports, or the "Ports" tab next to Terminal).
2. **Forward a Port** → enter `8080`.
3. Right-click the forwarded port → **Port Visibility → Public**.
4. Copy the generated `https://<id>-8080.<region>.devtunnels.ms` URL.

### Option C — ngrok (if/when available)
```
ngrok http 8080
```
Copy the printed `https://<id>.ngrok.app` URL.

### Option D — Deploy it (best for a real event)
Host the server on Render / Railway / Fly.io / a VM. You get a permanent `https://` URL
and skip tunnels entirely. Set the same env vars below in the host's config.

> Whichever you pick, you end up with one public base URL. Call it `PUBLIC_BASE_URL` below.
> Example: `https://abcd-1234.trycloudflare.com`

---

## Step 2 — Point your Twilio number at it

In the **Twilio Console**:
1. Phone Numbers → Manage → **Active numbers** → click your number.
2. Under **Voice Configuration → "A call comes in"**:
   - Set to **Webhook**
   - URL: `https://<your-public-base-url>/voice/incoming`
   - HTTP method: **POST**
3. Save.

(The webhook chain is: `/voice/incoming` asks for a room code via the keypad, then
`/voice/join` connects the call into Conversation Relay at `wss://<host>/voice`.)

---

## Step 3 — Start the server with your credentials

Signature validation turns ON in production mode, so set the real auth token:

```
PUBLIC_BASE_URL=https://<your-public-base-url> \
TWILIO_AUTH_TOKEN=<your_auth_token> \
NODE_ENV=production \
PORT=8080 \
npm run dev:server
```

You should see it log the listening URL and the webhook/voice endpoints.

> Note: with `NODE_ENV=production` the server validates Twilio's `X-Twilio-Signature`
> on every webhook and **fails closed** if the auth token is missing. For a quick
> no-Twilio local sanity check you can omit `NODE_ENV=production` to skip validation.

---

## Step 4 — Open the display (spectator / operator console)

In a second terminal:
```
npm run dev:client
```
Then open: `http://localhost:5173/?display=1&room=4821`

The display watches room `4821` and renders every phone player's car. It is also the
operator console: **press Enter to start the race.**

---

## Step 5 — Make the call and play

1. **Call your Twilio number** from your phone.
2. When prompted, **enter `4821`** on the keypad.
3. On the display, **press Enter** to start the race (do this once players have joined).
4. Speak commands: **"left"**, **"right"**, **"boost"**, **"brake"**, **"use power"**.
5. Watch your car respond on the shared display.

DTMF fallback (if speech is flaky in a noisy room): keypad **1**=left, **2**=boost,
**3**=right, **4**=brake, **5**=use power.

---

## Step 6 — Observe & tune latency (the real point of this step)

Note these while playing:
- **Command-to-move latency** — roughly how long between speaking and the car reacting.
- Whether the car responds to **interim** transcripts (snappier) or only after you finish
  the word. (We requested `partialPrompts="true"` + `speechModel="flux"`, which should
  give interim frames.)
- Whether you can **react in time** to dodge a barrier at the current pace.

If the pace is too fast to dodge by voice, increase the runway in
`shared/constants.ts`:
- Lower `BASE_SPEED` (cars move slower → more reaction time), and/or
- Raise `ITEM_SPACING` / `ITEM_START` (hazards spaced further apart / start later).

After changing constants, **re-run `npm test`** — the simulation tests use these values
and must still pass (adjust any test that hard-codes a number, keeping its intent).

---

## Things to watch / known notes

- **Caller with no/blank room code** lands in a default room `0000` (no rejection message,
  by design — there's no spoken feedback in this milestone).
- **Room full / race already in progress:** the caller's speech simply does nothing
  (no spoken error this milestone). They'll hear silence.
- **Conversation Relay runs as a pure transcription feed** — the server never sends a
  `text` message back, so nothing is ever spoken to the caller. Confirm this holds (no
  unexpected TTS) during the test.
- **Empty rooms accumulate** in memory on a long-running server (known deferred cleanup).
  Fine for a demo session; restart the server between long sessions.

---

## Quick local sanity check (no phone, no tunnel)

To confirm the server and voice WebSocket wiring work without Twilio, you can run the
automated integration test, which simulates a Conversation Relay client:
```
npm test -- voice-integration
```
This proves a "phone" socket joins a room and a spoken command moves a car — it just
can't measure real-world latency (that's what the live call is for).
