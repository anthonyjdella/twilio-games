// The ambient BATTLE BACKDROP for Voice Monsters — the pixel-art atmosphere BEHIND the monsters. The
// stage used to be a mostly-empty dark rect (the 3D arena spins in the mid-ground, but the upper/dark
// regions read as blank). This fills that space with cheap, GB-styled life that's alive even at rest:
//   • a banded parallax "sky" gradient up top (dithered stripes, DMG-limited palette),
//   • a soft sun/glow bloom high on one side,
//   • slow-drifting pixel clouds (chunky blocks) across the sky,
//   • fine dust motes floating through the whole scene,
//   • a subtle vignette darkening the corners so the creatures pop.
// All drawn on the transparent GB canvas in the SCENE band only (y 0..HORIZON), then it hands off to
// the arena + monsters below — it NEVER paints over the HP boxes or the command window (y88+). Kept as
// a tiny self-contained module (its own drifting state) so battle-renderer only makes one call.

const GB_W = 160;
const SKY_H = 62;        // sky band height — clears the top HP box (y8..28) visually behind it, ends
                         // well above the command window (y88). Below this the arena/ground shows.

// A muted GB-adjacent palette for the sky so the backdrop feels handheld, not modern-gradient. Dark
// teal-navy at the top easing to a warm horizon — complements the arena's deep-green void.
const SKY_TOP = '#0a1526';
const SKY_MID = '#132a3a';
const SKY_LOW = '#2b4a4a';
const HORIZON = '#5a6e4a';   // warm greenish horizon glow where sky meets the arena
const SUN = '#c9d98a';       // soft pale sun/glow (GB-green-tinted, low + right)

// A drifting pixel cloud: chunky block silhouette, wraps horizontally. Positions in GB coords.
interface Cloud { x: number; y: number; w: number; h: number; speed: number; shade: string; }
// A floating dust mote: tiny, slow, wraps; brightness varies by index for depth.
interface Mote { x: number; y: number; speed: number; drift: number; shade: string; size: number; }

export class Backdrop {
  private clouds: Cloud[] = [];
  private motes: Mote[] = [];

  constructor() {
    // Deterministic layout (index-seeded, not rng) so the scene composes the same every mount — the
    // MOTION is time-driven, the placement is fixed. A few clouds at staggered depths/speeds.
    const cloudDefs: Array<[number, number, number, number, number, string]> = [
      [20, 10, 22, 4, 0.05, '#26405a'],
      [90, 6, 30, 5, 0.03, '#1c3348'],
      [130, 20, 18, 3, 0.07, '#2f4a64'],
      [55, 24, 26, 4, 0.04, '#243b52'],
    ];
    this.clouds = cloudDefs.map(([x, y, w, h, speed, shade]) => ({ x, y, w, h, speed, shade }));
    // ~26 motes spread over the scene band; index drives depth (speed/brightness/size).
    for (let i = 0; i < 26; i++) {
      this.motes.push({
        x: (i * 37) % GB_W,
        y: 4 + (i * 13) % (SKY_H + 18),
        speed: 0.06 + (i % 4) * 0.03,
        drift: 0.5 + (i % 3) * 0.4,
        shade: i % 3 === 0 ? '#8bac7f' : i % 3 === 1 ? '#5a7a6a' : '#3f5a52',
        size: i % 5 === 0 ? 2 : 1,
      });
    }
  }

  /** Draw the backdrop into the SCENE band, BEHIND the monsters. ctx is already scaled to GB coords by
   *  the renderer. `tick` drives the drift; nothing here touches y>SKY_H+... so the HP boxes/command
   *  window (opaque panels drawn later) always sit cleanly on top. */
  draw(ctx: CanvasRenderingContext2D, tick: number): void {
    ctx.save();
    this.drawSky(ctx);
    this.drawSun(ctx, tick);
    this.drawClouds(ctx, tick);
    this.drawMotes(ctx, tick);
    this.drawVignette(ctx);
    ctx.restore();
  }

  /** Banded, lightly-dithered sky gradient — horizontal stripes in 4 shades (GB feel, no smooth blend),
   *  with a 1px checker dither at each band edge so the transition reads as pixel-art. */
  private drawSky(ctx: CanvasRenderingContext2D): void {
    const bands: Array<[number, string]> = [
      [0, SKY_TOP], [Math.round(SKY_H * 0.28), SKY_MID],
      [Math.round(SKY_H * 0.60), SKY_LOW], [Math.round(SKY_H * 0.86), HORIZON],
    ];
    for (let b = 0; b < bands.length; b++) {
      const [y0, col] = bands[b]!;
      const y1 = b + 1 < bands.length ? bands[b + 1]![0] : SKY_H;
      ctx.fillStyle = col;
      ctx.fillRect(0, y0, GB_W, y1 - y0);
      // dither the top edge into the previous band (checker of the two shades) for a pixel transition
      if (b > 0) {
        ctx.fillStyle = bands[b - 1]![1];
        for (let x = 0; x < GB_W; x += 2) ctx.fillRect(x + (y0 % 2), y0, 1, 1);
      }
    }
  }

  /** A soft pale glow high-right — a couple of concentric translucent blocks (no smooth radial) that
   *  breathe very slowly so the sky isn't static. */
  private drawSun(ctx: CanvasRenderingContext2D, tick: number): void {
    const cx = 124, cy = 16;
    const pulse = 1 + Math.sin(tick * 0.02) * 0.12;
    ctx.globalAlpha = 0.5;
    for (let r = 3; r >= 1; r--) {
      ctx.fillStyle = r === 1 ? SUN : HORIZON;
      const s = Math.round(r * 3 * pulse);
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      ctx.globalAlpha *= 0.7;
    }
    ctx.globalAlpha = 1;
  }

  /** Chunky pixel clouds drifting across the sky, wrapping at the edges. Each is a rounded-ish block
   *  (a wide bar + a shorter cap) so it reads as a cloud, not a rectangle. */
  private drawClouds(ctx: CanvasRenderingContext2D, tick: number): void {
    for (const c of this.clouds) {
      let x = (c.x + tick * c.speed) % (GB_W + c.w) - c.w;   // wrap fully off-screen-left → back to right
      x = Math.round(x);
      ctx.fillStyle = c.shade;
      ctx.fillRect(x, c.y + 1, c.w, c.h - 1);                // body
      ctx.fillRect(x + 3, c.y, c.w - 6, 1);                  // rounded top cap
      ctx.fillRect(x + 2, c.y + c.h - 1, c.w - 4, 1);        // rounded bottom
    }
  }

  /** Fine dust motes drifting up-left across the scene, gently bobbing; wrap around the band. Index-
   *  driven depth (dim/slow = far). Adds constant subtle motion so the stage never feels dead. */
  private drawMotes(ctx: CanvasRenderingContext2D, tick: number): void {
    const bandH = SKY_H + 20;   // motes float a little below the sky, up to where the arena floor reads
    for (const m of this.motes) {
      const x = Math.round(((m.x - tick * m.speed) % GB_W + GB_W) % GB_W);
      const y = Math.round(m.y + Math.sin(tick * 0.03 + m.x) * m.drift);
      if (y < 0 || y > bandH) continue;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = m.shade;
      ctx.fillRect(x, y, m.size, m.size);
    }
    ctx.globalAlpha = 1;
  }

  /** A subtle corner vignette: darken the four corners of the scene band with translucent wedges so
   *  the lit center (where the monsters stand) pops. Cheap: four small gradient-free triangular fades
   *  approximated by a few stacked translucent rects at each corner. */
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000814';
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.05;
      const t = i * 2;
      ctx.fillRect(0, 0, GB_W, t);                 // top edge fade
      ctx.fillRect(0, SKY_H + 20 - t, GB_W, t);    // bottom-of-band fade (into the arena floor)
    }
    // side edges
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.04;
      ctx.fillRect(0, 0, i, SKY_H + 20);
      ctx.fillRect(GB_W - i, 0, i, SKY_H + 20);
    }
    ctx.globalAlpha = 1;
  }
}
