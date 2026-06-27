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
