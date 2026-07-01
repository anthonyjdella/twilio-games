# Lobby join QR code

The lobby screen shows `client/public/brand/join-qr.png` as the "scan to call and join" QR code.

**`join-qr.png` is currently a 1×1 placeholder** — replace it with the real Twilio QR code image
you want players to scan. Just overwrite the file (keep the same name/path):

```sh
cp /path/to/your-twilio-qr.png client/public/brand/join-qr.png
```

Then commit it. Vite copies `client/public/` into the build, and the server serves it at
`/brand/join-qr.png`, so no code changes are needed — the lobby picks it up automatically.

Notes:
- A square PNG works best (it's displayed at 240×240 on a white card). SVG also works if you rename
  the `<img src>` in `client/screens.ts` accordingly.
- The QR should encode however you want players to reach the call (e.g. a `tel:` link to the game
  number). The room code is entered by the caller on the phone keypad (Twilio DTMF) after they call —
  that's shown as step 3 in the lobby and is intentionally a manual entry to showcase DTMF.
- If the file is missing, the lobby hides the image gracefully (the steps still show).
