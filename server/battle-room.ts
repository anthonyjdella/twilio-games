// Server-side game room for Voice Monsters: lobby → monster_select → battle → results. Wraps the pure
// BattleWorld and owns joining, per-player monster picks, single-player (1 human vs AI) vs 2-player,
// and the AI's auto-responses. Mirrors Room's public shape so the GameServer wiring is familiar. No
// ws/http here — fully unit-testable.
import { BattleWorld, type BattleSnapshot, type BattleEvent, type Side } from '../shared/battle-world';
import { ROSTER, monsterById, type Monster } from '../shared/monster-roster';
import { pickAiMove } from '../shared/battle-ai';
import { Rng } from '../shared/rng';

export type BattlePhase = 'lobby' | 'monster_select' | 'battle' | 'results';

interface Slot { id: string; name: string; monsterId: string | null; isAi: boolean; }

/** Roster row for the lobby / monster-select screens. */
export interface BattlePlayer { playerId: string; name: string; monsterId: string | null; isAi: boolean; }

export interface BattleResult { winner: Side; winnerName: string; }

const AI_ID = 'cpu';
const AI_NAME = 'Rival';

export class BattleRoom {
  readonly code: string;
  private seed: number;
  private _phase: BattlePhase = 'lobby';
  private slots: Slot[] = [];       // human players (max 2)
  private nextId = 1;
  private world: BattleWorld | null = null;
  private ai: { side: Side; monster: Monster } | null = null;   // set in single-player battles
  private _result: BattleResult | null = null;
  private events: BattleEvent[] = [];
  private aiRng: Rng;

  constructor(code: string, seed: number) {
    this.code = code;
    this.seed = seed >>> 0;
    this.aiRng = new Rng(this.seed ^ 0x5bd1e995);
  }

  get phase(): BattlePhase { return this._phase; }
  get playerCount(): number { return this.slots.length; }
  get isEmpty(): boolean { return this.slots.length === 0; }

  /** Roster for the shared-display lobby + monster-select screens. */
  lobbyPlayers(): BattlePlayer[] {
    return this.slots.map(s => ({ playerId: s.id, name: s.name, monsterId: s.monsterId, isAi: s.isAi }));
  }

  /** Add a human player. Battles are 1v1, so at most 2 humans. A finished battle reopens on a join. */
  addPlayer(name: string): { playerId: string } | { error: string } {
    if (this._phase === 'results') this.reset();
    if (this.slots.length >= 2) return { error: 'room_full' };
    const id = `p${this.nextId++}`;
    this.slots.push({ id, name: name || `Player ${this.slots.length + 1}`, monsterId: null, isAi: false });
    return { playerId: id };
  }

  removePlayer(playerId: string): void {
    this.slots = this.slots.filter(s => s.id !== playerId);
    if (this.slots.length === 0 && this._phase !== 'lobby') this.reset();
  }

  setPlayerInfo(playerId: string, info: { name?: string }): void {
    const s = this.slots.find(x => x.id === playerId);
    if (s && info.name) s.name = info.name.slice(0, 20);
  }

  /** Pick a monster during monster_select (validated against the roster). */
  selectMonster(playerId: string, monsterId: string): void {
    if (this._phase !== 'monster_select') return;
    if (!monsterById(monsterId)) return;
    const s = this.slots.find(x => x.id === playerId);
    if (s) s.monsterId = monsterId;
  }

  /** Host advances the flow: lobby → monster_select → battle. From results, "advance" = rematch
   *  (keep the roster, back to monster_select). Starting the battle fills an AI opponent when solo. */
  advance(): void {
    if (this._phase === 'results') {
      this.world = null; this.ai = null; this._result = null;
      for (const s of this.slots) s.monsterId = null;
      this._phase = 'monster_select';
      return;
    }
    if (this._phase === 'lobby') {
      if (this.slots.length > 0) this._phase = 'monster_select';
      return;
    }
    if (this._phase === 'monster_select' && this.canStart()) this.start();
  }

  back(): void {
    if (this._phase === 'monster_select') this._phase = 'lobby';
  }

  /** Ready to battle when at least one human has picked a monster (the 2nd side is the other human
   *  if present + picked, else an AI). */
  private canStart(): boolean {
    const picked = this.slots.filter(s => s.monsterId);
    if (this.slots.length >= 2) return this.slots.every(s => s.monsterId);   // 2P: both must pick
    return picked.length === 1;                                              // 1P: the human picked
  }

  private start(): void {
    const humans = this.slots.filter(s => s.monsterId);
    const a = humans[0]!;
    let bId: string, bName: string, bMonster: string;
    if (this.slots.length >= 2) {
      const b = this.slots[1]!.id === a.id ? this.slots[0]! : this.slots.find(s => s.id !== a.id)!;
      bId = b.id; bName = b.name; bMonster = b.monsterId!;
    } else {
      // Single-player: AI opponent gets a random DIFFERENT monster.
      bId = AI_ID; bName = AI_NAME; bMonster = this.pickAiMonster(a.monsterId!);
      this.ai = { side: 'b', monster: monsterById(bMonster)! };
    }
    this.world = new BattleWorld(
      { id: a.id, name: a.name, monsterId: a.monsterId! },
      { id: bId, name: bName, monsterId: bMonster },
      this.seed,
    );
    this._phase = 'battle';
    this.captureEvents();
  }

  private pickAiMonster(avoid: string): string {
    const pool = ROSTER.filter(m => m.id !== avoid);
    return pool[this.aiRng.int(pool.length)]!.id;
  }

  /** A player (or the AI, internally) chooses a move. In single-player the AI auto-responds, so one
   *  human choice resolves the turn; in 2-player the turn resolves once BOTH humans have chosen. */
  chooseMove(playerId: string, moveId: string): void {
    if (this._phase !== 'battle' || !this.world) return;
    this.world.chooseMove(playerId, moveId);
    // Single-player: as soon as the human commits, the AI commits too (server-authoritative).
    if (this.ai && this.world.phase === 'choosing') {
      const s = this.world.snapshot();
      const oppState = this.ai.side === 'b' ? s.a : s.b;
      const aiMon = this.ai.monster;
      const oppMon = monsterById(oppState.monsterId)!;
      const aiId = this.ai.side === 'b' ? s.b.id : s.a.id;
      const move = pickAiMove(aiMon, oppMon, this.aiRng);
      this.world.chooseMove(aiId, move);
    }
    this.captureEvents();
  }

  /** Pull resolution events out of the world into the room's queue + detect battle end. */
  private captureEvents(): void {
    if (!this.world) return;
    this.events.push(...this.world.drainEvents());
    if (this.world.phase === 'finished' && this._phase === 'battle') {
      const s = this.world.snapshot();
      const winnerSide = s.winner!;
      const winnerName = winnerSide === 'a' ? s.a.name : s.b.name;
      this._result = { winner: winnerSide, winnerName };
      this._phase = 'results';
    }
  }

  reset(): void {
    this.world = null; this.ai = null; this._result = null; this.events = [];
    for (const s of this.slots) s.monsterId = null;
    this._phase = 'lobby';
  }

  snapshot(): BattleSnapshot | null { return this.world ? this.world.snapshot() : null; }
  result(): BattleResult | null { return this._result; }

  /** Drain queued battle events (renderer + commentator consume them; drained once). */
  drainEvents(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
