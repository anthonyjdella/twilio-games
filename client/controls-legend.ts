// ONE source of truth for the "how to control your car" legend, shown in two places: the lobby
// "How to Play" panel (while players join) and the get-ready countdown card (right before GO). Both
// the keyboard glyph AND the voice word are shown on each row, because a player might be on the
// shared keyboard OR shouting over a phone call — the same action, two ways to trigger it.
//
// Not player-specific (it's just "here's what the buttons do"), so it's safe on a shared screen with
// many players — unlike the live personal gauge, which we gate to a single local player.

interface Row { keys: string; voice: string; action: string; hint?: string; accent?: 'power' }

const ROWS: Row[] = [
  { keys: '← →', voice: '"left" · "right"', action: 'Change lane' },
  { keys: '↑', voice: '"boost" / "go"', action: 'Speed up', hint: 'tap to build speed' },
  { keys: '↓', voice: '"brake" / "slow"', action: 'Slow down' },
  { keys: 'Space', voice: '"power"', action: 'NITRO burst', accent: 'power',
    hint: 'one charge — grab glowing ⚡ pads to refill' },
];

/** The controls legend as an HTML string. `variant` tweaks the wrapper class for per-surface styling
 *  ('panel' = lobby side card, 'card' = countdown overlay). Values are static (no user input). */
export function controlsLegendHtml(variant: 'panel' | 'card' = 'panel'): string {
  const rows = ROWS.map(r => `
    <div class="cl-row${r.accent === 'power' ? ' cl-power' : ''}">
      <span class="cl-key">${r.keys}</span>
      <span class="cl-voice">${r.voice}</span>
      <span class="cl-action">${r.action}${r.hint ? `<span class="cl-hint">${r.hint}</span>` : ''}</span>
    </div>`).join('');
  return `
    <div class="controls-legend cl-${variant}">
      <div class="cl-title">How to play</div>
      <div class="cl-sub">Keyboard or shout it over the phone</div>
      ${rows}
    </div>`;
}
