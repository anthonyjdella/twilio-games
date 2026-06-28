import { GameConnection } from './net';
import { KeyboardAdapter } from './input-keyboard';
import { Renderer } from './renderer';
import { InterpolationBuffer } from './interpolation';
import { AssetLoader } from './asset-loader';
import { Announcer, browserSpeechSink } from './announcer';

const url = `ws://${location.hostname}:8080/game`;
const conn = new GameConnection(url);
const input = new KeyboardAdapter();
const assets = new AssetLoader();
const renderer = new Renderer(document.getElementById('app')!, assets);
const buffer = new InterpolationBuffer(100);
const big = document.getElementById('big')!;
const lobbyEl = document.getElementById('lobby')!;
const lobbyCodeEl = document.getElementById('lobbyCode')!;
const lobbyCountEl = document.getElementById('lobbyCount')!;
const lobbyPlayersEl = document.getElementById('lobbyPlayers')!;

const roomCode = new URLSearchParams(location.search).get('room') ?? '4821';
const name = new URLSearchParams(location.search).get('name') ?? 'You';
const isDisplay = new URLSearchParams(location.search).get('display') === '1';

let started = false;
let raceLive = false;

// AI announcer: speaks commentary (host audio) and feeds the ticker HUD.
const tickerEl = document.getElementById('ticker')!;
function pushLine(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = 'background:rgba(16,22,40,.85);color:#e8ecf6;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;font-size:13px';
  tickerEl.prepend(div);
  while (tickerEl.children.length > 5) tickerEl.lastChild!.remove();
  setTimeout(() => div.remove(), 6000);
}
const announcer = new Announcer({ sink: browserSpeechSink(), onLine: pushLine });
// Start muted-safe; unlock audio on the first user gesture (Enter-to-start counts).
announcer.setMuted(true);
let hostOn = false;
function enableHost() { if (!hostOn) { hostOn = true; announcer.setMuted(false); } }
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
muteBtn.addEventListener('click', () => {
  hostOn = !hostOn; announcer.setMuted(!hostOn);
  muteBtn.textContent = hostOn ? '🔊 Host' : '🔇 Host';
});

conn.onItems((items) => renderer.buildItems(items));
conn.onSnapshot((s) => { raceLive = true; lobbyEl.style.display = 'none'; started = true; buffer.push(s, performance.now()); });
conn.onLobby((m) => {
  if (raceLive) return;                       // race already running; ignore stale lobby
  lobbyEl.style.display = 'flex';
  big.textContent = '';                       // lobby overlay replaces the "waiting" text
  lobbyCodeEl.textContent = m.roomCode;
  const n = m.players.length;
  lobbyCountEl.textContent = n === 0 ? `Call ${m.roomCode} to join`
    : `${n} racer${n === 1 ? '' : 's'} in — call ${m.roomCode} to join more`;
  lobbyPlayersEl.innerHTML = '';
  for (const p of m.players) {
    const chip = document.createElement('div');
    chip.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(35,43,69,.9);border:1px solid #38425e;border-radius:999px;padding:8px 14px;font-size:15px';
    const dot = document.createElement('span');
    dot.style.cssText = `width:14px;height:14px;border-radius:50%;background:${p.color};display:inline-block`;
    const nm = document.createElement('span'); nm.textContent = p.name;
    chip.append(dot, nm); lobbyPlayersEl.appendChild(chip);
  }
});
conn.onEvent((e) => {
  announcer.handle(e);
  if (e.kind === 'countdown') big.textContent = String(e.n);
  else if (e.kind === 'go') { big.textContent = 'GO!'; setTimeout(() => (big.textContent = ''), 900); }
  else if (e.kind === 'race_over') big.textContent = '🏁';
});
conn.onError((code, message) => {
  console.error(`Server error [${code}]: ${message}`);
  big.textContent = `⚠ ${message}`;
});

async function boot() {
  // Load GLB templates before the first render; primitives if the manifest is
  // missing or any model fails (loadManifest swallows errors), so the game
  // always starts.
  try { await assets.loadManifest(); } catch { /* primitives */ }

  if (isDisplay) {
    // Shared screen: a pure SPECTATOR that renders every player's car and frames the
    // whole pack (no "my car", so the camera doesn't lock onto the wrong one). The
    // operator presses Enter to start. Phone callers are the players.
    conn.spectate(roomCode);
    renderer.setSpectator(true);
    addEventListener('keydown', (e) => {
      if (e.key === 'r') conn.restart();
      else if (e.key === 'Enter') { enableHost(); conn.ready(); }
    });
  } else {
    // Dev keyboard-player path: join as a player and drive with the keyboard.
    conn.onJoined((playerId) => { renderer.setMyId(playerId); });
    input.onIntent((i) => conn.sendIntent(i));
    addEventListener('keydown', (e) => {
      if (e.key === 'r') conn.restart();
      else if (e.key === 'Enter') { enableHost(); conn.ready(); }
    });
    conn.join(roomCode, name);
  }

  function frame() {
    requestAnimationFrame(frame);
    const snap = buffer.sample(performance.now());
    if (snap) renderer.render(snap);
    else if (!started) big.textContent = isDisplay
      ? `Call in + enter room ${roomCode}, then press ENTER`
      : 'Waiting… press ENTER to start';
  }
  requestAnimationFrame(frame);
}

void boot();
