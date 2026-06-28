// Pure URL-building + input sanitation for the home/lobby page.
// Kept DOM-free so it can be unit-tested under node.

export type PlayMode = 'host' | 'player';

export interface PlayParams {
  mode: PlayMode;
  roomCode: string;
  name?: string;
  /** Which level (maps.json key) to load. Omitted/empty → the game's generated fallback world. */
  map?: string;
}

/** A level key is a safe identifier (letters, digits, _, -). Empty/invalid → '' (no map param). */
export function sanitizeMap(raw?: string): string {
  return /^[A-Za-z0-9_-]+$/.test(raw ?? '') ? raw! : '';
}

/** A room code is exactly 4 digits. Sanitize arbitrary input to that, or default. */
export function sanitizeRoomCode(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, 4);
  return digits.length === 4 ? digits : '4821'; // sensible default room
}

/** Trim + length-cap a player name; empty becomes a friendly default. */
export function sanitizeName(raw: string): string {
  const n = (raw ?? '').trim().slice(0, 20);
  return n.length > 0 ? n : 'Racer';
}

/**
 * Build the racer page URL for a join action.
 * Host  → play.html?display=1&room=CODE[&map=LEVEL]   (shared spectator/operator screen)
 * Player→ play.html?room=CODE&name=ENCODED[&map=LEVEL] (keyboard player; same code phones dial)
 * The optional `map` loads a saved level; omitted → the generated fallback world.
 */
export function buildPlayUrl(params: PlayParams): string {
  const room = sanitizeRoomCode(params.roomCode);
  const map = sanitizeMap(params.map);
  const mapPart = map ? `&map=${map}` : '';
  if (params.mode === 'host') {
    return `play.html?display=1&room=${room}${mapPart}`;
  }
  const name = encodeURIComponent(sanitizeName(params.name ?? ''));
  return `play.html?room=${room}&name=${name}${mapPart}`;
}
