// The per-attack FX layer for Voice Monsters: chunky, pixel-art elemental effects that fire on the
// EXISTING battle-event stream. On a `move_used` we `trigger(type, from, to)` a launch burst that
// travels from the attacker toward the defender; on `damage` we `impact(type, on)` a hit burst on the
// struck monster. Each TYPE looks distinct (embers rise, droplets arc, a bolt strobes…) — the SHAPE +
// COLOR + MOTION recipe comes from fx-spec.ts (the pure, testable half); THIS file only turns a spec
// into moving pixels on the transparent GB canvas (drawn OVER the monsters).
//
// Self-contained: owns its own particle pool + a couple of transient overlays (a lightning bolt, a
// screen strobe, psychic warp rings). battle-renderer just constructs one, calls draw() each frame,
// and forwards events to trigger()/impact(). Cheap: a few dozen small rects/arcs per hit, no library.
import { fxSpecFor, aimVector, SIDE_POS, type FxSpec, type FxShape } from './fx-spec';

// One live particle in GB-logical coords. vx/vy are per-frame px; drawn as a small chunky rect/arc.
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  spin: number;                 // for leaves/shards (accumulated rotation)
  spinV: number;
  shape: FxShape;
  color: string; color2: string;
  gravity: number;
}

// A short-lived electric bolt: a jagged polyline from attacker → defender, redrawn (jittered) for a
// few frames then gone. Kept separate from particles because it's ONE zig-zag stroke, not a swarm.
interface Bolt { x0: number; y0: number; x1: number; y1: number; life: number; maxLife: number; color: string; color2: string; }
// A psychic warp ring: an expanding hollow square that fades. Separate because it's drawn as an
// outline, not a filled dot.
interface Ring { x: number; y: number; life: number; maxLife: number; grow: number; color: string; }

export class AttackFx {
  private parts: Particle[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private strobe = 0;   // 0..1 full-screen tint flash (electric), eases down

  /** Launch burst: attacker `from` fires its move's typed effect toward defender `to`. The projectile
   *  spawns at the attacker and biases its motion toward the target per the spec's travel style. */
  trigger(type: string, from: 'a' | 'b', to: 'a' | 'b'): void {
    const spec = fxSpecFor(type);
    const src = SIDE_POS[from], dst = SIDE_POS[to];
    const aim = aimVector(from, to);
    if (spec.strobe) this.strobe = 1;                               // electric: flash the whole arena

    if (spec.shape === 'bolt') {                                    // electric → a forked bolt src→dst
      this.bolts.push({ x0: src.x, y0: src.y - 6, x1: dst.x, y1: dst.y, life: spec.life, maxLife: spec.life, color: spec.color, color2: spec.color2 });
    }
    if (spec.travel === 'warp') {                                   // psychic → rings BLOOM on target, no travel
      for (let i = 0; i < spec.count; i++) this.rings.push({ x: dst.x, y: dst.y, life: spec.life + i * 3, maxLife: spec.life + i * 3, grow: 0.7 + i * 0.15, color: spec.color });
      return;
    }
    // Everyone else: a swarm launched from the caster, aimed toward the foe (arc/straight/rise).
    for (let i = 0; i < spec.count; i++) this.parts.push(this.spawn(spec, src.x, src.y - 8, aim, i, false));
  }

  /** Impact burst: the defender `on` was struck — spray the type's particles OUTWARD from the hit
   *  point (no aim bias; scatter in all directions) for the "it connected" punch. */
  impact(type: string, on: 'a' | 'b'): void {
    const spec = fxSpecFor(type);
    const p = SIDE_POS[on];
    if (spec.travel === 'warp') { this.rings.push({ x: p.x, y: p.y, life: spec.life, maxLife: spec.life, grow: 1.1, color: spec.color }); return; }
    for (let i = 0; i < spec.impactCount; i++) this.parts.push(this.spawn(spec, p.x, p.y, { x: 0, y: 0 }, i, true));
  }

  /** Build one particle. `aim` biases the initial velocity toward the target on a launch (zero on an
   *  impact = pure outward scatter). Variation is index-driven (deterministic-ish) plus a little jitter
   *  — purely cosmetic, client-only. */
  private spawn(spec: FxSpec, x: number, y: number, aim: { x: number; y: number }, i: number, impact: boolean): Particle {
    // Fan the burst around the aim direction: even indices go one way, odd the other, so it reads as a
    // cone/spray rather than a single line. On an impact (aim 0) it's a full radial scatter.
    const ang = impact
      ? (i / spec.impactCount) * Math.PI * 2 + (i % 2 ? 0.4 : 0)
      : Math.atan2(aim.y, aim.x) + ((i % 2 ? 1 : -1) * (0.15 + (i * 0.11) % 0.7));
    const spd = (impact ? 0.6 : 1.0) * (0.7 + ((i * 7) % 5) / 10);   // px/frame, index-varied
    const jitter = (Math.random() - 0.5) * 0.4;                      // cosmetic-only micro-variation
    let vx = Math.cos(ang) * spd * (1 + jitter);
    let vy = Math.sin(ang) * spd * (1 + jitter);
    // Rising types (fire/ground) always drift up regardless of aim; give them an upward kick.
    if (spec.travel === 'rise') { vy = -Math.abs(vy) - 0.4; vx *= 0.6; }
    const scatter = (i / Math.max(1, spec.count)) * spec.spread - spec.spread / 2;
    return {
      x: x + (impact ? 0 : scatter * 0.3), y,
      vx, vy,
      life: spec.life + (i % 3), maxLife: spec.life + (i % 3),
      size: spec.size + (i % 2),                    // mix two chunk sizes for texture
      spin: (i * 0.7) % (Math.PI * 2), spinV: (i % 2 ? 0.25 : -0.25),
      shape: spec.shape, color: spec.color, color2: spec.color2, gravity: spec.gravity,
    };
  }

  /** True while anything is still animating (lets callers skip work when idle, if they want). */
  get active(): boolean { return this.parts.length > 0 || this.bolts.length > 0 || this.rings.length > 0 || this.strobe > 0; }

  /** Advance + draw the whole FX layer. Call AFTER the monsters are drawn (these sit OVER the sprites).
   *  ctx is already scaled by `S` in the renderer's render(), so we draw in GB-logical coords and pass
   *  S only for sub-pixel-safe rect rounding. `tick` drives cheap flicker. */
  draw(ctx: CanvasRenderingContext2D, _S: number, tick: number): void {
    // Full-screen strobe (electric): a faint white wash that decays instantly — the "flash" of a zap.
    if (this.strobe > 0) {
      ctx.save();
      ctx.globalAlpha = this.strobe * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 160, 88);        // only the scene area (never the command window at y88+)
      ctx.restore();
      this.strobe = Math.max(0, this.strobe - 0.18);
    }

    this.drawBolts(ctx, tick);
    this.drawRings(ctx);
    this.drawParticles(ctx, tick);
  }

  private drawParticles(ctx: CanvasRenderingContext2D, tick: number): void {
    ctx.save();
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k]!;
      // integrate
      p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.spin += p.spinV; p.life--;
      p.vx *= 0.98;                                  // gentle drag so bursts settle
      if (p.life <= 0 || p.y > 90) { this.parts.splice(k, 1); continue; }   // die / never enter the window
      const t = p.life / p.maxLife;                  // 1 → 0
      ctx.globalAlpha = Math.min(1, t * 1.4);        // fade out over the tail of life
      this.drawShape(ctx, p, t, tick);
    }
    ctx.restore();
  }

  /** One particle's pixel motif, dispatched on its shape. All chunky (whole-px rects) to stay GB. */
  private drawShape(ctx: CanvasRenderingContext2D, p: Particle, t: number, tick: number): void {
    const x = Math.round(p.x), y = Math.round(p.y), s = p.size;
    switch (p.shape) {
      case 'ember': {                                // fire: flickering core + hot center
        const flick = ((tick + Math.round(p.x)) % 3 === 0);
        ctx.fillStyle = t > 0.5 ? p.color2 : p.color;
        ctx.fillRect(x, y, s, s);
        if (flick) { ctx.fillStyle = p.color2; ctx.fillRect(x, y - 1, 1, 1); }   // spark tail
        break;
      }
      case 'droplet': {                              // water: round drop + light glint
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, s * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color2; ctx.fillRect(x - 1, y - 1, 1, 1);
        break;
      }
      case 'leaf': {                                 // grass: spinning blade (2 rects crossed by spin)
        const w = Math.cos(p.spin) > 0 ? s : 1;      // "flip" as it spins → blade look, cheap
        ctx.fillStyle = p.color; ctx.fillRect(x, y, w, s);
        ctx.fillStyle = p.color2; ctx.fillRect(x, y, w, 1);
        break;
      }
      case 'shard': {                                // rock: tumbling angular chunk (dark edge)
        ctx.fillStyle = p.color; ctx.fillRect(x, y, s, s);
        ctx.fillStyle = '#3a2f1f'; ctx.fillRect(x, y + s - 1, s, 1);   // shaded underside
        ctx.fillStyle = p.color2; ctx.fillRect(x, y, 1, 1);           // top glint
        break;
      }
      case 'dust': {                                 // ground: soft low puff (translucent block)
        ctx.globalAlpha *= 0.6;
        ctx.fillStyle = p.color; ctx.fillRect(x, y, s + 1, s);
        break;
      }
      case 'streak': {                               // flying: thin fast slash along its velocity
        ctx.fillStyle = p.color;
        const lx = Math.round(p.vx * 3), ly = Math.round(p.vy * 3);
        ctx.fillRect(x, y, Math.max(1, Math.abs(lx)) , Math.max(1, s));
        ctx.fillStyle = p.color2; ctx.fillRect(x - lx, y - ly, 1, 1);   // trailing wisp
        break;
      }
      case 'star': {                                 // normal: 4-point impact spark
        ctx.fillStyle = p.color;
        ctx.fillRect(x - s, y, s * 2 + 1, 1);        // horizontal arm
        ctx.fillRect(x, y - s, 1, s * 2 + 1);        // vertical arm
        ctx.fillStyle = p.color2; ctx.fillRect(x, y, 1, 1);
        break;
      }
      default: {                                     // ring particles handled elsewhere; safety fill
        ctx.fillStyle = p.color; ctx.fillRect(x, y, s, s);
      }
    }
  }

  /** Electric bolt: a jagged forked polyline that jitters each frame it's alive, then a hot core pass.
   *  Deterministic-ish zig-zag from a sine on the segment index + tick (no reliance on rng timing). */
  private drawBolts(ctx: CanvasRenderingContext2D, tick: number): void {
    ctx.save();
    for (let k = this.bolts.length - 1; k >= 0; k--) {
      const b = this.bolts[k]!;
      b.life--;
      if (b.life <= 0) { this.bolts.splice(k, 1); continue; }
      const segs = 7;
      const dx = (b.x1 - b.x0) / segs, dy = (b.y1 - b.y0) / segs;
      // Two passes: a fat colored bolt, then a thin bright core over it.
      for (const [pass, col, wide] of [[0, b.color, true], [1, b.color2, false]] as const) {
        ctx.strokeStyle = col; ctx.lineWidth = wide ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0);
        for (let i = 1; i <= segs; i++) {
          const jag = Math.sin(i * 2.3 + tick * 0.9 + pass) * (wide ? 4 : 2) * (i / segs);
          // perpendicular offset for the zig-zag
          const px = -dy, py = dx, len = Math.hypot(px, py) || 1;
          ctx.lineTo(b.x0 + dx * i + (px / len) * jag, b.y0 + dy * i + (py / len) * jag);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Psychic warp rings: expanding hollow squares (chunky, not smooth circles) that fade as they grow —
   *  reads as reality bending around the target. */
  private drawRings(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k]!;
      r.life--;
      if (r.life <= 0) { this.rings.splice(k, 1); continue; }
      const age = 1 - r.life / r.maxLife;            // 0 → 1
      const rad = Math.round(2 + age * 18 * r.grow);
      ctx.globalAlpha = (1 - age) * 0.9;
      ctx.strokeStyle = r.color; ctx.lineWidth = 1;
      ctx.strokeRect(r.x - rad, r.y - rad, rad * 2, rad * 2);   // square ring = pixel "warp"
    }
    ctx.restore();
  }
}
