// ONE source of truth for the "how to play" legend, shown on the lobby screen before a race. This
// game is played BY VOICE over a phone call (Twilio Conversation Relay), so the legend teaches the
// SPOKEN commands — no keyboard keys are shown anywhere (the shared screen isn't how you drive).
//
// Not player-specific (it's just "here's what to shout"), so it's safe on a shared screen with many
// players — unlike the live personal gauge, which we gate to a single local player.

interface Row { say: string; action: string; hint?: string; accent?: 'power' }

const ROWS: Row[] = [
  { say: '“Left” · “Right”', action: 'Change lane' },
  { say: '“Boost” / “Go”', action: 'Speed up' },
  { say: '“Brake” / “Slow”', action: 'Slow down' },
  { say: '“Power”', action: 'NITRO burst', accent: 'power',
    hint: 'one charge — grab the glowing ⚡ pads to refill' },
];

/** The controls legend as an HTML string (shown in the lobby, pre-race). Values are static. */
export function controlsLegendHtml(): string {
  const rows = ROWS.map(r => `
    <div class="cl-row${r.accent === 'power' ? ' cl-power' : ''}">
      <span class="cl-say">${r.say}</span>
      <span class="cl-action">${r.action}${r.hint ? `<span class="cl-hint">${r.hint}</span>` : ''}</span>
    </div>`).join('');
  return `
    <div class="controls-legend">
      <div class="cl-title">How to play</div>
      <div class="cl-sub">Just talk — shout your moves into the call</div>
      ${rows}
    </div>`;
}
