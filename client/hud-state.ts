// Pure derivation of the in-race personal HUD (power charge + boost bar) from a world snapshot.
// No DOM/three here so it's unit-testable. main.ts calls this each frame and paints the result.
//
// MULTIPLAYER: the personal HUD is meaningful ONLY when there's a genuine local player — a solo
// keyboard racer, or the shared screen after its operator pressed P to play. On a pure spectator /
// shared display (no myId) there is no "you", so a personal ⚡/boost readout would be ambiguous and
// distracting ("whose power is that?"). In that case we return { show: false } and paint nothing;
// that screen relies on the countdown card + lobby legend + voice for control guidance instead.
import type { WorldSnapshot } from '../shared/types';

export interface HudState {
  show: boolean;                 // false → hide the personal HUD entirely (shared display / no local car)
  powerReady?: boolean;          // a stored nitro charge is available to fire (Space / "power")
  powerActive?: boolean;         // nitro is currently firing (the ~2s burst)
  charges?: number;              // remaining stored charges (usually 0 or 1)
  boost?: number;                // throttle modifier (-1.4..+2.2), for the boost/brake bar
  stunned?: boolean;             // just clipped a barrier (brief slow) — lets the bar flash a warning
}

/**
 * Derive the personal HUD for `myId` from `snap`. Returns { show:false } when there's no local
 * player (spectator/shared display) or that player's car isn't in the race (spectating a race,
 * finished, or not yet spawned) — the caller then hides the HUD.
 */
export function hudStateFor(snap: WorldSnapshot | null, myId: string | null): HudState {
  if (!snap || !myId) return { show: false };
  const me = snap.cars.find(c => c.id === myId);
  if (!me || me.finished) return { show: false };
  return {
    show: true,
    charges: me.power,
    powerReady: me.power > 0,
    powerActive: me.powerActive > 0,
    boost: me.boost,
    stunned: me.stunned > 0,
  };
}
