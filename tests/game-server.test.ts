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

  it('events reach all clients in a room, not just the first', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const a = connect(port); await a.open();
    const b = connect(port); await b.open();
    a.ws.send(JSON.stringify({ type: 'join', roomCode: '9090', name: 'You' }));
    b.ws.send(JSON.stringify({ type: 'join', roomCode: '9090', name: 'Ada' }));
    await wait(50);
    a.ws.send(JSON.stringify({ type: 'ready' }));
    await wait(700);
    expect(a.inbox.some(m => m.type === 'event')).toBe(true);
    expect(b.inbox.some(m => m.type === 'event')).toBe(true);
  });

  it('two players in lobby both receive a lobby roster with both names', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const a = connect(port); await a.open();
    const b = connect(port); await b.open();
    a.ws.send(JSON.stringify({ type: 'join', roomCode: '8200', name: 'Ada' }));
    b.ws.send(JSON.stringify({ type: 'join', roomCode: '8200', name: 'Rex' }));
    await wait(250);
    const lob = [...b.inbox].reverse().find((m: any) => m.type === 'lobby') as any;
    expect(lob).toBeDefined();
    const names = lob.players.map((p: any) => p.name).sort();
    expect(names).toEqual(['Ada', 'Rex']);
    expect(lob.phase).toBe('lobby');
  });

  it('reclaims a room once its last player disconnects (no leak)', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const c = connect(port); await c.open();
    c.ws.send(JSON.stringify({ type: 'join', roomCode: '3030', name: 'You' }));
    await wait(80);
    expect(server.roomCount).toBe(1);
    c.ws.close();
    await wait(120);
    expect(server.roomCount).toBe(0);
  });

  it('restart rebuilds a fresh race with a NEW procedural course (per-race variety)', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const c = connect(port); await c.open();
    c.ws.send(JSON.stringify({ type: 'join', roomCode: '3131', name: 'You' }));
    await wait(50);
    c.ws.send(JSON.stringify({ type: 'ready' }));
    await wait(150);
    const first = [...c.inbox].reverse().find(m => m.type === 'items') as any;
    const firstSig = JSON.stringify(first.items);
    // Host hits restart (the 'r' key) — must reroll to a different course, not replay the same one.
    c.ws.send(JSON.stringify({ type: 'restart' }));
    await wait(150);
    const items2 = [...c.inbox].filter(m => m.type === 'items') as any[];
    const secondSig = JSON.stringify(items2[items2.length - 1].items);
    expect(items2.length).toBeGreaterThanOrEqual(2);   // restart sent a fresh items message
    expect(secondSig).not.toEqual(firstSig);            // and the course actually changed
  });

  it('a spectator receives snapshots without occupying a player slot', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    const port = await server.start();
    const player = connect(port); await player.open();
    const spec = connect(port); await spec.open();
    player.ws.send(JSON.stringify({ type:'join', roomCode:'8800', name:'P1' }));
    spec.ws.send(JSON.stringify({ type:'spectate', roomCode:'8800' }));
    await wait(50);
    player.ws.send(JSON.stringify({ type:'ready' }));
    await wait(200);
    const snap = [...spec.inbox].reverse().find(m => m.type === 'snapshot') as any;
    expect(snap).toBeDefined();
    expect(snap.snapshot.cars).toHaveLength(1);  // spectator added no car
  });

  it('drives the Smash-style flow over the wire: select car → map → race with chosen model', async () => {
    server = new GameServer({ port: 0, broadcastHz: 30 });
    server.setRoomConfigProvider(() => ({ carCount: 19, maps: ['Silver Lake', 'Neon City'] }));
    const port = await server.start();
    const host = connect(port); await host.open();
    host.ws.send(JSON.stringify({ type: 'join', roomCode: 'SMASH', name: 'Ada' }));
    await wait(60);
    host.ws.send(JSON.stringify({ type: 'advance' }));                  // → car_select
    await wait(60);
    const sel = [...host.inbox].reverse().find((m: any) => m.type === 'select_state') as any;
    expect(sel).toBeDefined();
    expect(sel.phase).toBe('car_select');
    expect(sel.maps).toEqual(['Silver Lake', 'Neon City']);
    host.ws.send(JSON.stringify({ type: 'select_car', carIndex: 12 }));
    await wait(60);
    host.ws.send(JSON.stringify({ type: 'advance' }));                  // → map_select
    await wait(60);
    host.ws.send(JSON.stringify({ type: 'select_map', map: 'Neon City' }));
    await wait(60);
    host.ws.send(JSON.stringify({ type: 'advance' }));                  // → race
    await wait(200);
    const snap = [...host.inbox].reverse().find((m: any) => m.type === 'snapshot') as any;
    expect(snap).toBeDefined();
    expect(snap.snapshot.cars[0].carIndex).toBe(12);                    // raced the chosen model
  });

  // NOTE: the results-broadcast PATH (results phase → 'results' message) is covered by
  // tests/room.test.ts (Room captures standings + enters 'results' when the world finishes) plus
  // preRaceMessage's results branch. A full solo race takes ~55s of sim time, too slow to drive
  // end-to-end over the wire in a unit test, so we don't replay one here.
});
