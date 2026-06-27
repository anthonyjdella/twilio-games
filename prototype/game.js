/* =====================================================================
   VOICE RACER — Look & Feel Prototype
   ---------------------------------------------------------------------
   Single-purpose: evaluate (1) gameplay feel, (2) voice-latency tolerance,
   (3) the studio-editor concept — with throwaway-friendly primitives.

   ARCHITECTURE (built to survive into the real game):
     SceneModel   — serializable data: objects[], lights, camera. Source of
                    truth for visuals. The editor WRITES it; renderer READS it.
     buildMesh()  — turns one SceneModel object into a three.js mesh.
     InputAdapter — emits discrete intents (MOVE_LEFT/RIGHT, BOOST, ...).
                    Keyboard now; the seam where Twilio voice plugs in later.
     LatencyBuffer— delays intents by an adjustable amount = voice simulator.
     RaceWorld    — authoritative game state, fixed-timestep. Server-portable.
     Renderer     — three.js scene; reads world + SceneModel, owns nothing.
     Editor       — TransformControls gizmo + inspector over same SceneModel.
   ===================================================================== */
(function () {
'use strict';
const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;

/* =====================================================================
   1. SCENE MODEL — editable, serializable description of the stage.
   The cars are dynamic (spawned by the game); the editor edits the stage.
   ===================================================================== */
const PALETTE = ['#f22f46','#36d1dc','#ffcf5c','#36e08a','#a06bff','#ff8a5c','#5c8aff','#ff5ca8'];
let ID = 1;
function prop(shape, name, pos, scale, color) {
  return { id: ID++, shape, name, pos: pos.slice(), rot: [0,0,0], scale: scale.slice(), color };
}
function defaultScene() {
  const objects = [];
  for (let i = 0; i < 12; i++) {
    const z = -40 + i * 16;
    objects.push(prop('box', `Pillar L${i}`, [-13, 2.5, z], [1, 5, 1], '#27314f'));
    objects.push(prop('box', `Pillar R${i}`, [ 13, 2.5, z], [1, 5, 1], '#27314f'));
  }
  objects.push(prop('box', 'Banner Red',  [-14, 6, 24], [0.4, 3, 9], '#f22f46'));
  objects.push(prop('box', 'Banner Cyan', [ 14, 6, 96], [0.4, 3, 9], '#36d1dc'));
  objects.push(prop('box', 'Start Gantry', [0, 7.6, -34], [26, 1.2, 1], '#e8ecf6'));
  objects.push(prop('cone', 'Marker A', [-9, 1, 8], [1.4, 2, 1.4], '#ffcf5c'));
  objects.push(prop('cone', 'Marker B', [ 9, 1, 8], [1.4, 2, 1.4], '#ffcf5c'));
  return {
    objects,
    lights: {
      sun:     { color: '#fff6e6', intensity: 1.2, azimuth: 35, elevation: 55 },
      ambient: { color: '#5566aa', intensity: 0.55 },
      sky: '#0b1020', ground: '#0e1430'
    },
    camera: { distance: 30, height: 15, sideOffset: 13, fov: 52, lookAhead: 26 }
  };
}

/* =====================================================================
   2. MESH FACTORY
   ===================================================================== */
const GEO = {};
function geoFor(shape) {
  if (GEO[shape]) return GEO[shape];
  let g;
  if (shape === 'cylinder')      g = new THREE.CylinderGeometry(0.5,0.5,1,24);
  else if (shape === 'cone')     g = new THREE.ConeGeometry(0.5,1,24);
  else if (shape === 'sphere')   g = new THREE.SphereGeometry(0.5,24,16);
  else                           g = new THREE.BoxGeometry(1,1,1);
  return (GEO[shape] = g);
}
function applyTransform(mesh, o) {
  mesh.position.set(o.pos[0], o.pos[1], o.pos[2]);
  mesh.rotation.set(THREE.MathUtils.degToRad(o.rot[0]),
                    THREE.MathUtils.degToRad(o.rot[1]),
                    THREE.MathUtils.degToRad(o.rot[2]));
  mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  mesh.material.color.set(o.color);
}
function buildMesh(o) {
  const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.6, metalness: 0.12 });
  const m = new THREE.Mesh(geoFor(o.shape), mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.modelId = o.id;
  applyTransform(m, o);
  return m;
}

/* =====================================================================
   3. RENDERER — owns the three.js scene. Reads SceneModel + RaceWorld.
   ===================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 300;
scene.add(sun, sun.target);
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

// ground + track surface
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 600),
  new THREE.MeshStandardMaterial({ color: 0x0e1430, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
scene.add(ground);
const TRACK_W = 18;
const track = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_W, 600),
  new THREE.MeshStandardMaterial({ color: 0x1a2238, roughness: 0.9 }));
track.rotation.x = -Math.PI / 2; track.receiveShadow = true;
scene.add(track);
// dashed lane lines
const LANES = 3;
const laneLineMat = new THREE.MeshBasicMaterial({ color: 0x44507a });
for (let i = 1; i < LANES; i++) {
  const x = -TRACK_W/2 + (TRACK_W/LANES) * i;
  for (let z = -100; z < 320; z += 8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), laneLineMat);
    dash.rotation.x = -Math.PI/2; dash.position.set(x, 0.02, z);
    scene.add(dash);
  }
}
// track edge stripes
[-TRACK_W/2, TRACK_W/2].forEach(x => {
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 600),
    new THREE.MeshBasicMaterial({ color: 0xf22f46 }));
  edge.rotation.x = -Math.PI/2; edge.position.set(x, 0.02, 60);
  scene.add(edge);
});

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 2000);
const propGroup = new THREE.Group(); scene.add(propGroup);   // editable stage props
const carGroup = new THREE.Group(); scene.add(carGroup);     // dynamic cars
const itemGroup = new THREE.Group(); scene.add(itemGroup);   // barriers & boost pads

function syncSceneToModel(model) {
  // rebuild prop meshes from data (simple + correct for a prototype)
  while (propGroup.children.length) propGroup.remove(propGroup.children[0]);
  model.objects.forEach(o => propGroup.add(buildMesh(o)));
  applyLights(model.lights);
  scene.background = new THREE.Color(model.lights.sky);
  ground.material.color.set(model.lights.ground);
}
function applyLights(L) {
  sun.color.set(L.sun.color); sun.intensity = L.sun.intensity;
  const az = THREE.MathUtils.degToRad(L.sun.azimuth), el = THREE.MathUtils.degToRad(L.sun.elevation);
  const r = 120;
  sun.position.set(Math.cos(az)*Math.cos(el)*r, Math.sin(el)*r, Math.sin(az)*Math.cos(el)*r);
  sun.target.position.set(0, 0, 60);
  ambient.color.set(L.ambient.color); ambient.intensity = L.ambient.intensity;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

/* shared module namespace */
const APP = {
  THREE, $, clamp, lerp, PALETTE,
  prop, defaultScene, geoFor, applyTransform, buildMesh,
  nextId: () => ID, useId: () => ID++,
  renderer, scene, camera, sun, ambient, ground, track,
  propGroup, carGroup, syncSceneToModel, applyLights,
  TRACK_W, LANES,
};
window.__VR = APP;

/* =====================================================================
   4. CAR FACTORY — body + 4 wheels as separate meshes.
   This split is deliberate: when we swap in real glTF models later, static
   models get their wheels animated the same way (rotate wheel meshes).
   ===================================================================== */
const RACERS = [
  { name: 'You',    color: '#36d1dc', me: true },
  { name: 'Ada',    color: '#f22f46' },
  { name: 'Rex',    color: '#ffcf5c' },
  { name: 'Nova',   color: '#36e08a' },
  { name: 'Volt',   color: '#a06bff' },
  { name: 'Blaze',  color: '#ff8a5c' },
  { name: 'Echo',   color: '#5c8aff' },
  { name: 'Pixel',  color: '#ff5ca8' },
];
function buildCar(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 3.4), bodyMat);
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x111522, roughness: 0.2, metalness: 0.6 }));
  cabin.position.set(0, 1.25, -0.2); cabin.castShadow = true; g.add(cabin);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.3), bodyMat);
  fin.position.set(0, 1.05, -1.7); g.add(fin);
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 0.85 });
  const wheels = [];
  [[-1.05,-1.1],[1.05,-1.1],[-1.05,1.1],[1.05,1.1]].forEach(([x,z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI/2; w.position.set(x, 0.5, z); w.castShadow = true;
    g.add(w); wheels.push(w);
  });
  g.userData.wheels = wheels;
  g.userData.body = body;
  return g;
}

/* =====================================================================
   5. INPUT ADAPTER + LATENCY BUFFER
   InputAdapter emits intents from *some* source (keyboard here). The game
   subscribes; it never knows the source — that's the Twilio-voice seam.
   LatencyBuffer delays each intent, simulating voice round-trip time.
   ===================================================================== */
const INTENTS = ['MOVE_LEFT','MOVE_RIGHT','BOOST','BRAKE','USE_POWER','PICK_LEFT','PICK_RIGHT'];
class InputAdapter {
  constructor() { this.subs = []; }
  on(fn) { this.subs.push(fn); }
  emit(intent) { this.subs.forEach(fn => fn(intent)); }
}
class LatencyBuffer {
  constructor(adapter, sink) {
    this.delay = 250; this.sink = sink; this.pending = []; // default snappy; slider raises to voice-latency
    adapter.on(intent => {
      const at = performance.now() + this.delay;
      this.pending.push({ intent, at, t0: performance.now() });
      if (onIntentQueued) onIntentQueued(intent, this.delay);
    });
  }
  update(now) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (now >= this.pending[i].at) {
        const p = this.pending.splice(i, 1)[0];
        this.sink(p.intent);
        if (onIntentExecuted) onIntentExecuted(p.intent);
      }
    }
  }
}
let onIntentQueued = null, onIntentExecuted = null;

const keyboard = new InputAdapter();
addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  const map = { ArrowLeft:'MOVE_LEFT', ArrowRight:'MOVE_RIGHT', ArrowUp:'BOOST',
                ArrowDown:'BRAKE', ' ':'USE_POWER' };
  if (e.key === 'r' || e.key === 'R') { resetRace(); return; }
  // during a fork prompt, left/right become the anticipation pick
  if (anticipation.active && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    keyboard.emit(e.key === 'ArrowLeft' ? 'PICK_LEFT' : 'PICK_RIGHT');
    e.preventDefault(); return;
  }
  if (map[e.key]) { keyboard.emit(map[e.key]); e.preventDefault(); }
});

/* =====================================================================
   6. RACE WORLD — authoritative, fixed-timestep simulation.
   Lane-based lateral movement + auto-forward speed. Server-portable later.
   ===================================================================== */
const TRACK_LEN = 320;           // z-distance per lap
const LAP_TARGET = 3;            // ~45-60s race = enough time to feel the controls
function laneX(lane) { return -APP.TRACK_W/2 + (APP.TRACK_W/APP.LANES)*(lane+0.5); }

class RaceWorld {
  constructor() { this.reset(); }
  reset() {
    this.cars = RACERS.map((r, i) => ({
      ...r, idx: i,
      lane: i % APP.LANES, targetLane: i % APP.LANES,
      x: laneX(i % APP.LANES), z: -i * 3,
      speed: 38, baseSpeed: 38, boost: 0, power: 1, powerActive: 0, stunned: 0,
      lap: 1, finished: false, finishT: 0, place: i+1,
    }));
    this.t = 0; this.started = false; this.startCountdown = 3.2; this.over = false;
    // obstacles & boost pads: the REASON to change lanes.
    // Pre-generate a fixed gauntlet so every racer faces the same course.
    // Cars' z is cumulative across laps, so item z is just an absolute distance.
    this.items = [];
    let oid = 1;
    for (let z = 55; z < TRACK_LEN * LAP_TARGET; z += 24) {
      const lane = Math.floor(Math.random() * APP.LANES);
      const kind = Math.random() < 0.62 ? 'barrier' : 'boost';
      this.items.push({ id: oid++, kind, lane, z, hit: {} });  // hit[carIdx] = already triggered
    }
  }
  applyIntent(intent) {
    const me = this.cars.find(c => c.me);
    if (!me || me.finished || !this.started) return;
    if (intent === 'MOVE_LEFT')  me.targetLane = APP.clamp(me.targetLane - 1, 0, APP.LANES-1);
    if (intent === 'MOVE_RIGHT') me.targetLane = APP.clamp(me.targetLane + 1, 0, APP.LANES-1);
    if (intent === 'BOOST')      me.boost = Math.min(me.boost + 1.4, 2.2);
    if (intent === 'BRAKE')      me.boost = Math.max(me.boost - 1.6, -1.4);
    if (intent === 'USE_POWER' && me.power > 0) { me.power--; me.powerActive = 2.2; }
    if (intent === 'PICK_LEFT' || intent === 'PICK_RIGHT') resolveAnticipation(intent, me);
  }
  step(dt) {
    if (!this.started) {
      this.startCountdown -= dt;
      if (this.startCountdown <= 0) this.started = true;
      return;
    }
    this.t += dt;
    for (const c of this.cars) {
      if (c.finished) { c.z += c.baseSpeed * dt; continue; }  // coast off-screen, no pileup
      if (!c.me) this.driveAI(c);
      else c.boost = lerp(c.boost, 0, 0.6*dt);  // player boost/brake decays back to cruise
      // lateral easing toward target lane (this smoothness is why latency feels OK)
      const tx = laneX(c.targetLane);
      c.x = lerp(c.x, tx, 1 - Math.pow(0.0001, dt));
      c.lane = c.targetLane;
      // forward speed
      const powerBoost = c.powerActive > 0 ? 16 : 0;
      if (c.powerActive > 0) c.powerActive -= dt;
      if (c.stunned > 0) c.stunned -= dt;
      const stunPenalty = c.stunned > 0 ? -18 : 0;
      c.speed = Math.max(8, c.baseSpeed + c.boost*12 + powerBoost + stunPenalty);
      c.z += c.speed * dt;
      // lap accounting
      if (c.z >= TRACK_LEN * c.lap) {
        c.lap++;
        if (c.lap > LAP_TARGET) { c.finished = true; c.finishT = this.t; }
      }
    }
    this.resolveItems();
    this.resolveCollisions(dt);
    this.updatePlaces();
    if (this.cars.every(c => c.finished)) this.over = true;
  }

  // AI: look ahead, dodge the next barrier, drift toward a nearby boost pad.
  driveAI(c) {
    const ahead = this.items
      .filter(it => it.z > c.z + 4 && it.z < c.z + 34)
      .sort((a,b) => a.z - b.z)[0];
    if (ahead) {
      if (ahead.kind === 'barrier' && ahead.lane === c.targetLane) {
        // step away from the barrier
        c.targetLane = APP.clamp(c.targetLane + (c.targetLane === 0 ? 1 : -1), 0, APP.LANES-1);
      } else if (ahead.kind === 'boost' && Math.abs(ahead.lane - c.targetLane) <= 1) {
        c.targetLane = ahead.lane;   // grab the boost if it's adjacent
      }
    }
    c.boost = lerp(c.boost, 0.15, 0.04);  // mild eagerness so the pack stays lively
  }

  // The core loop: hitting a barrier stuns you, grabbing a boost speeds you up.
  resolveItems() {
    for (const c of this.cars) {
      if (c.finished) continue;
      for (const it of this.items) {
        if (it.hit[c.idx]) continue;
        if (Math.abs(it.z - c.z) < 2.2 && it.lane === c.lane) {
          it.hit[c.idx] = true;
          if (it.kind === 'barrier') {
            c.stunned = 0.8; c.boost = -0.6;
            if (c.me) { flashToast('💥 Hit a barrier!'); }
          } else {
            c.powerActive = Math.max(c.powerActive, 1.4);
            if (c.me) { flashToast('⚡ Boost!'); }
          }
        }
      }
    }
  }
  resolveCollisions(dt) {
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i+1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        if (Math.abs(a.z - b.z) < 3.4 && Math.abs(a.x - b.x) < 2.0) {
          // same-ish cell: bump them apart + bleed speed (real-ish collision)
          const push = (a.x <= b.x) ? -1 : 1;
          a.x += push * 1.2 * dt * 8; b.x -= push * 1.2 * dt * 8;
          a.boost *= 0.9; b.boost *= 0.9;
          a.x = APP.clamp(a.x, laneX(0), laneX(APP.LANES-1));
          b.x = APP.clamp(b.x, laneX(0), laneX(APP.LANES-1));
        }
      }
  }
  updatePlaces() {
    const order = [...this.cars].sort((p,q) => {
      if (p.finished && q.finished) return p.finishT - q.finishT;
      if (p.finished) return -1; if (q.finished) return 1;
      return q.z - p.z;
    });
    order.forEach((c, i) => c.place = i + 1);
  }
}

/* =====================================================================
   7. GAME RUNTIME — bind world state to meshes, drive camera + HUD.
   ===================================================================== */
let mode = 'play';               // 'play' | 'edit'
let model = defaultScene();
syncSceneToModel(model);

const world = new RaceWorld();
const carMeshes = world.cars.map(c => {
  const m = buildCar(c.color); carGroup.add(m);
  if (c.me) {
    // bright bouncing "YOU" arrow + ring so the player can instantly spot their car
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4),
      new THREE.MeshBasicMaterial({ color: 0x36d1dc }));
    cone.rotation.x = Math.PI;          // point down
    cone.position.y = 4; m.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x36d1dc }));
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.06; m.add(ring);
    m.userData.youMarker = cone;
  }
  return m;
});
const latency = new LatencyBuffer(keyboard, (intent) => world.applyIntent(intent));

/* ---- build item (barrier / boost pad) meshes from world.items ---- */
let itemMeshes = [];
function buildItemMeshes() {
  while (itemGroup.children.length) itemGroup.remove(itemGroup.children[0]);
  itemMeshes = world.items.map(it => {
    let mesh;
    if (it.kind === 'barrier') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(APP.TRACK_W/APP.LANES - 1.5, 1.6, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.5,
          emissive: 0x550000, emissiveIntensity: 0.5 }));
      mesh.position.y = 0.8;
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 20),
        new THREE.MeshStandardMaterial({ color: 0x36e08a, roughness: 0.3,
          emissive: 0x0a5a32, emissiveIntensity: 0.9 }));
      mesh.position.y = 0.13;
    }
    mesh.position.x = laneX(it.lane); mesh.position.z = it.z;
    mesh.castShadow = true;
    itemGroup.add(mesh);
    return { mesh, it };
  });
}
buildItemMeshes();

function renderItems(dt) {
  for (const { mesh, it } of itemMeshes) {
    // dim items already passed/collected by the player for feedback
    const me = world.cars.find(c => c.me);
    const passed = me && (it.hit[me.idx] || it.z < me.z - 3);
    mesh.visible = !passed || it.z > me.z - 3;
    if (it.kind === 'boost') mesh.rotation.y += dt * 2;       // spin the pads
    mesh.material.opacity = passed ? 0.25 : 1;
    mesh.material.transparent = passed;
  }
}

function resetRace() {
  world.reset();
  buildItemMeshes();
  anticipation.active = false; $('anticipation').classList.remove('show');
  nextAnticipationAt = 6;
  flashToast('Race restarted');
}

/* ---- Anticipation system (the "C" layer: call the fork before you reach it) ---- */
const anticipation = { active: false, until: 0, kind: null, resolved: false };
let nextAnticipationAt = 6;
function maybeTriggerAnticipation() {
  return;  // disabled for now: the obstacle gauntlet is the core mechanic.
  /* eslint-disable no-unreachable */
  if (!world.started || world.over) return;
  if (!anticipation.active && world.t >= nextAnticipationAt) {
    anticipation.active = true; anticipation.resolved = false;
    anticipation.until = world.t + 2.4;
    anticipation.kind = Math.random() < 0.5 ? 'fork' : 'hazard';
    const ant = $('anticipation');
    $('antQ').textContent = anticipation.kind === 'fork' ? 'FORK AHEAD' : '⚠ HAZARD AHEAD';
    $('antOpts').innerHTML = anticipation.kind === 'fork'
      ? 'say “left” or “right” — <span class="timer" id="antTimer">2.4s</span>'
      : 'dodge: “left” or “right” — <span class="timer" id="antTimer">2.4s</span>';
    ant.classList.add('show');
  }
  if (anticipation.active) {
    const left = anticipation.until - world.t;
    const t = $('antTimer'); if (t) t.textContent = Math.max(0, left).toFixed(1) + 's';
    if (left <= 0) {
      // no answer in time = penalty
      if (!anticipation.resolved) {
        const me = world.cars.find(c => c.me);
        if (me) { me.boost = -1.2; flashToast('Missed the call! Slowed down.'); }
      }
      closeAnticipation();
    }
  }
}
function resolveAnticipation(intent, me) {
  if (!anticipation.active || anticipation.resolved) return;
  anticipation.resolved = true;
  const good = Math.random() < 0.5
    ? intent === 'PICK_LEFT' : intent === 'PICK_RIGHT';   // randomized "correct" path
  if (anticipation.kind === 'fork') {
    if (good) { me.powerActive = 1.6; flashToast('Nice line! Shortcut boost!'); }
    else flashToast('Long way round…');
  } else {
    if (good) flashToast('Dodged it!');
    else { me.boost = -1.4; flashToast('Clipped the hazard!'); }
  }
  closeAnticipation();
}
function closeAnticipation() {
  anticipation.active = false;
  $('anticipation').classList.remove('show');
  nextAnticipationAt = world.t + 5 + Math.random()*4;
}

/* ---- 3/4 "chase the pack" spectator camera ----
   Sits behind + above + slightly to the side of the player, looking down-track.
   This angle makes left/right lane changes read clearly on screen (a pure side
   view hides them along the depth axis), while still showing the whole field. */
function updateCamera(dt) {
  const cam = model.camera;
  camera.fov = cam.fov; camera.updateProjectionMatrix();
  const me = world.cars.find(c => c.me) || world.cars[0];
  // Chase cam locked to the PLAYER: sits behind + above + slightly to the side,
  // looks down-track past the player so approaching items are clearly visible.
  const target = new THREE.Vector3(me.x * 0.4, 1.5, me.z + cam.lookAhead);
  const desired = new THREE.Vector3(me.x * 0.5 + cam.sideOffset, cam.height, me.z - cam.distance);
  camera.position.lerp(desired, 1 - Math.pow(0.0006, dt));
  camera.lookAt(target);
}

/* ---- bind sim -> meshes ---- */
function renderCars(dt) {
  world.cars.forEach((c, i) => {
    const m = carMeshes[i];
    m.visible = true;
    m.position.set(c.x, 0, c.z);
    // bank into lane changes for life
    const drift = (laneX(c.targetLane) - c.x);
    m.rotation.z = APP.clamp(-drift * 0.12, -0.35, 0.35);
    m.rotation.y = APP.clamp(-drift * 0.06, -0.2, 0.2);
    // spin wheels proportional to speed
    const spin = c.speed * dt * 0.9;
    m.userData.wheels.forEach(w => { w.rotation.x += spin; });
    // squash/boost cue
    const s = c.powerActive > 0 ? 1.08 : 1;
    m.userData.body.scale.set(1, 1, s);
    // bounce the "YOU" marker
    if (m.userData.youMarker) m.userData.youMarker.position.y = 4 + Math.sin(world.t*4)*0.3;
  });
}

/* =====================================================================
   8. HUD
   ===================================================================== */
const cmdStream = $('cmdStream');
const intentIcon = { MOVE_LEFT:'◀ left', MOVE_RIGHT:'right ▶', BOOST:'⏫ boost',
  BRAKE:'⏬ brake', USE_POWER:'★ power', PICK_LEFT:'pick◀', PICK_RIGHT:'pick▶' };
onIntentQueued = (intent, delay) => {
  const row = document.createElement('div'); row.className = 'ev';
  row.innerHTML = `<span class="q">⏳ ${intentIcon[intent]||intent} <i>+${delay}ms</i></span>`;
  cmdStream.appendChild(row);
  while (cmdStream.children.length > 30) cmdStream.removeChild(cmdStream.firstChild);
};
onIntentExecuted = (intent) => {
  const row = document.createElement('div'); row.className = 'ev';
  row.innerHTML = `<span class="x">✓ ${intentIcon[intent]||intent}</span>`;
  cmdStream.appendChild(row);
  while (cmdStream.children.length > 30) cmdStream.removeChild(cmdStream.firstChild);
};
function updateHUD() {
  const me = world.cars.find(c => c.me);
  $('lapNo').textContent = me ? Math.min(me.lap, LAP_TARGET) : 1;
  $('speedVal').textContent = me ? Math.round(me.speed * 1.6) : 0;  // arbitrary "mph"
  const ol = $('standingsList');
  const order = [...world.cars].sort((a,b)=>a.place-b.place);
  ol.innerHTML = order.map(c =>
    `<li class="${c.me?'me':''}">${c.name}${c.me?' (you)':''}${c.finished?' 🏁':''}</li>`).join('');
}

/* big center overlay: countdown -> GO! -> (race) -> finish */
let goFlashUntil = 0;
function updateBigMsg() {
  const big = $('bigmsg'), top = $('bigmsgTop'), sub = $('bigmsgSub');
  if (!world.started) {
    const n = Math.ceil(world.startCountdown);
    big.style.display = 'flex'; big.classList.remove('go');
    top.textContent = n > 0 ? n : 'GO!';
    sub.textContent = 'get ready…';
    goFlashUntil = world.t + 0.9;
  } else if (world.over) {
    const me = world.cars.find(c => c.me);
    big.style.display = 'flex'; big.classList.remove('go');
    top.textContent = '🏁';
    sub.textContent = (me ? `You finished P${me.place}` : 'Race over') + ' — press R to race again';
  } else if (world.t < goFlashUntil) {
    big.style.display = 'flex'; big.classList.add('go');
    top.textContent = 'GO!'; sub.textContent = '';
  } else {
    big.style.display = 'none';
  }
}

let toastTimer = null;
function flashToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 1600);
}

/* ---- latency slider ---- */
$('latency').addEventListener('input', (e) => {
  latency.delay = +e.target.value;
  $('latVal').textContent = latency.delay + ' ms';
});

/* =====================================================================
   9. MAIN LOOP — fixed-timestep sim, free render.
   ===================================================================== */
let last = performance.now(), acc = 0;
const STEP = 1/60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  if (mode === 'play') {
    latency.update(now);
    acc += dt;
    while (acc >= STEP) { world.step(STEP); acc -= STEP; }
    maybeTriggerAnticipation();
    renderCars(dt);
    renderItems(dt);
    updateCamera(dt);
    updateHUD();
    updateBigMsg();
    carGroup.visible = true; itemGroup.visible = true;
  } else {
    carGroup.visible = false; itemGroup.visible = false;  // hide dynamic stuff while editing
    editorUpdate(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.__VR.buildCar = buildCar;
window.__VR.keyboard = keyboard;
window.__VR.RaceWorld = RaceWorld;
window.__VR.world = world;
window.__VR.flashToast = flashToast;
window.__VR.getModel = () => model;
window.__VR.setModel = (m) => { model = m; syncSceneToModel(model); };
window.__VR.getMode = () => mode;
window.__VR.setMode = (m) => { mode = m; };

/* =====================================================================
   10. EDITOR — studio over the same SceneModel.
   Orbit to look around, TransformControls gizmo to move/rotate/scale,
   click to select, inspector for precise values, add/dup/delete, lights,
   camera tuning, and save/load/export JSON.
   ===================================================================== */
const orbit = new THREE.OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.target.set(0, 1, 40); orbit.enabled = false;

const gizmo = new THREE.TransformControls(camera, renderer.domElement);
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value && mode==='edit'; });
gizmo.addEventListener('objectChange', () => { if (selectedMesh) writeBackTransform(); });
scene.add(gizmo);

let selectedMesh = null, selectedObj = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function meshForObj(o) { return propGroup.children.find(m => m.userData.modelId === o.id); }
function objForMesh(m) { return model.objects.find(o => o.id === m.userData.modelId); }

function select(obj) {
  selectedObj = obj;
  selectedMesh = obj ? meshForObj(obj) : null;
  if (selectedMesh) gizmo.attach(selectedMesh); else gizmo.detach();
  renderInspector(); renderHierarchy();
}
function writeBackTransform() {
  const o = selectedObj, m = selectedMesh; if (!o || !m) return;
  o.pos = [round(m.position.x), round(m.position.y), round(m.position.z)];
  o.rot = [round(THREE.MathUtils.radToDeg(m.rotation.x)),
           round(THREE.MathUtils.radToDeg(m.rotation.y)),
           round(THREE.MathUtils.radToDeg(m.rotation.z))];
  o.scale = [round(m.scale.x), round(m.scale.y), round(m.scale.z)];
  refreshInspectorFields();
}
const round = (n) => Math.round(n*100)/100;

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode !== 'edit' || gizmo.dragging) return;
  mouse.x = (e.clientX/innerWidth)*2 - 1;
  mouse.y = -(e.clientY/innerHeight)*2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(propGroup.children, false);
  if (hits.length) select(objForMesh(hits[0].object));
});

function editorUpdate() { orbit.update(); }

/* ---- toolbar wiring (TransformControls modes: translate/rotate/scale) ---- */
const toolBtns = { move:$('tMove'), rotate:$('tRotate'), scale:$('tScale') };
function setG(gmode, key) {
  gizmo.setMode(gmode);
  ['move','rotate','scale'].forEach(k => toolBtns[k].classList.toggle('active', k===key));
}
$('tMove').onclick = () => setG('translate','move');
$('tRotate').onclick = () => setG('rotate','rotate');
$('tScale').onclick = () => setG('scale','scale');

$('tAdd').onclick = () => {
  const shapes = ['box','cylinder','cone','sphere'];
  const shape = shapes[Math.floor(Math.random()*shapes.length)];
  const o = prop(shape, `${shape} ${model.objects.length+1}`,
    [0, 1.5, (orbit.target.z||40)], [2,2,2], PALETTE[Math.floor(Math.random()*PALETTE.length)]);
  model.objects.push(o); propGroup.add(buildMesh(o)); select(o);
  flashToast('Added ' + shape);
};
$('tDup').onclick = () => {
  if (!selectedObj) return flashToast('Select an object first');
  const c = JSON.parse(JSON.stringify(selectedObj));
  c.id = window.__VR.useId(); c.name = selectedObj.name + ' copy';
  c.pos = [c.pos[0]+3, c.pos[1], c.pos[2]+3];
  model.objects.push(c); propGroup.add(buildMesh(c)); select(c);
  flashToast('Duplicated');
};
$('tDel').onclick = () => {
  if (!selectedObj) return flashToast('Select an object first');
  const m = meshForObj(selectedObj); if (m) propGroup.remove(m);
  model.objects = model.objects.filter(o => o.id !== selectedObj.id);
  gizmo.detach(); select(null); flashToast('Deleted');
};
addEventListener('keydown', (e) => {
  if (mode !== 'edit') return;
  if (e.key === 'g') setG('translate','move');
  if (e.key === 'r') setG('rotate','rotate');
  if (e.key === 's' && !(e.metaKey||e.ctrlKey)) setG('scale','scale');
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObj) $('tDel').onclick();
  if ((e.metaKey||e.ctrlKey) && e.key === 'd') { e.preventDefault(); $('tDup').onclick(); }
});

/* ---- save / load / export (localStorage + file) ---- */
const LS_KEY = 'voiceRacer.scene.v1';
$('tSave').onclick = () => { localStorage.setItem(LS_KEY, JSON.stringify(model)); flashToast('Saved to browser'); };
$('tLoad').onclick = () => {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return flashToast('Nothing saved yet');
  try { window.__VR.setModel(JSON.parse(raw)); select(null); flashToast('Loaded'); }
  catch { flashToast('Load failed'); }
};
$('tExport').onclick = () => {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'voice-racer-scene.json'; a.click();
  flashToast('Exported scene.json');
};
$('tReset').onclick = () => { window.__VR.setModel(defaultScene()); select(null); flashToast('Scene reset'); };

/* ---- inspector panel ---- */
function vecRow(label) {
  // values are populated by refreshInspectorFields() right after render
  return `<div class="editrow"><span class="ax">${label}</span>` +
    ['x','y','z'].map((ax,i) =>
      `<input type="number" step="0.25" data-vec="${label}" data-i="${i}" value="0">`).join('') +
    `</div>`;
}
function renderInspector() {
  const body = $('inspBody');
  if (!selectedObj) {
    body.innerHTML = `
      <div class="hint">Click an object in the viewport or list to edit it.</div>
      ${lightsAndCameraUI()}`;
    bindLightCameraInputs();
    return;
  }
  const o = selectedObj;
  body.innerHTML = `
    <label class="field">name <input type="text" id="iName" value="${o.name}"></label>
    <label class="field">shape
      <select id="iShape">${['box','cylinder','cone','sphere'].map(s=>
        `<option ${s===o.shape?'selected':''}>${s}</option>`).join('')}</select></label>
    <label class="field">color
      <span class="row"><input type="color" id="iColor" value="${o.color}">
      <span class="swatchset" id="iSwatches"></span></span></label>
    <div class="divider"></div>
    <div class="hint">Position</div>   ${vecRow('pos')}
    <div class="hint">Rotation°</div>  ${vecRow('rot')}
    <div class="hint">Scale</div>      ${vecRow('scale')}
    <div class="divider"></div>
    ${lightsAndCameraUI()}`;
  refreshInspectorFields();
  // swatches
  const sw = $('iSwatches');
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.style.cssText = `width:18px;height:18px;padding:0;border-radius:4px;background:${c}`;
    b.onclick = () => { o.color = c; $('iColor').value = c; applyTransform(selectedMesh, o); };
    sw.appendChild(b);
  });
  $('iName').oninput = (e) => { o.name = e.target.value; renderHierarchy(); };
  $('iColor').oninput = (e) => { o.color = e.target.value; applyTransform(selectedMesh, o); };
  $('iShape').onchange = (e) => {
    o.shape = e.target.value;
    const old = selectedMesh; propGroup.remove(old);
    const nm = buildMesh(o); propGroup.add(nm); selectedMesh = nm; gizmo.attach(nm);
  };
  body.querySelectorAll('input[data-vec]').forEach(inp => {
    inp.oninput = () => {
      const key = inp.dataset.vec, i = +inp.dataset.i;
      o[key][i] = parseFloat(inp.value) || 0;
      applyTransform(selectedMesh, o);
    };
  });
  bindLightCameraInputs();
}
function refreshInspectorFields() {
  if (!selectedObj) return;
  ['pos','rot','scale'].forEach(key =>
    document.querySelectorAll(`input[data-vec="${key}"]`).forEach(inp =>
      { inp.value = selectedObj[key][+inp.dataset.i]; }));
}

function lightsAndCameraUI() {
  const L = model.lights, C = model.camera;
  return `
  <details open><summary>Lighting</summary>
    <label class="field">sun color <input type="color" id="lSunColor" value="${L.sun.color}"></label>
    <label class="field">intensity <input type="range" id="lSunInt" min="0" max="3" step="0.05" value="${L.sun.intensity}"></label>
    <label class="field">azimuth <input type="range" id="lSunAz" min="0" max="360" value="${L.sun.azimuth}"></label>
    <label class="field">elevation <input type="range" id="lSunEl" min="5" max="90" value="${L.sun.elevation}"></label>
    <label class="field">ambient <input type="color" id="lAmbColor" value="${L.ambient.color}"></label>
    <label class="field">amb int <input type="range" id="lAmbInt" min="0" max="2" step="0.05" value="${L.ambient.intensity}"></label>
    <label class="field">sky <input type="color" id="lSky" value="${L.sky}"></label>
    <label class="field">ground <input type="color" id="lGround" value="${L.ground}"></label>
  </details>
  <details><summary>Play Camera</summary>
    <label class="field">distance <input type="range" id="cDist" min="10" max="80" value="${C.distance}"></label>
    <label class="field">height <input type="range" id="cHeight" min="3" max="60" value="${C.height}"></label>
    <label class="field">side <input type="range" id="cSide" min="-60" max="60" value="${C.sideOffset}"></label>
    <label class="field">FOV <input type="range" id="cFov" min="20" max="80" value="${C.fov}"></label>
    <label class="field">look ahead <input type="range" id="cLook" min="-20" max="40" value="${C.lookAhead}"></label>
    <div class="hint">Tip: tune these, then hit ▶ Play to see the spectator framing.</div>
  </details>`;
}
function bindLightCameraInputs() {
  const L = model.lights, C = model.camera;
  const bind = (id, fn) => { const el = $(id); if (el) el.oninput = (e)=>{ fn(e.target.value); }; };
  bind('lSunColor', v => { L.sun.color=v; applyLights(L); });
  bind('lSunInt',   v => { L.sun.intensity=+v; applyLights(L); });
  bind('lSunAz',    v => { L.sun.azimuth=+v; applyLights(L); });
  bind('lSunEl',    v => { L.sun.elevation=+v; applyLights(L); });
  bind('lAmbColor', v => { L.ambient.color=v; applyLights(L); });
  bind('lAmbInt',   v => { L.ambient.intensity=+v; applyLights(L); });
  bind('lSky',      v => { L.sky=v; scene.background.set(v); });
  bind('lGround',   v => { L.ground=v; ground.material.color.set(v); });
  bind('cDist', v => C.distance=+v);  bind('cHeight', v => C.height=+v);
  bind('cSide', v => C.sideOffset=+v); bind('cFov', v => C.fov=+v);
  bind('cLook', v => C.lookAhead=+v);
}

/* ---- hierarchy list ---- */
function renderHierarchy() {
  const list = $('hierList');
  list.innerHTML = model.objects.map(o =>
    `<div class="item ${selectedObj&&selectedObj.id===o.id?'sel':''}" data-id="${o.id}">
       <span>${o.name}</span><span class="tag">${o.shape}</span></div>`).join('');
  list.querySelectorAll('.item').forEach(el =>
    el.onclick = () => select(model.objects.find(o => o.id === +el.dataset.id)));
}

/* =====================================================================
   11. MODE SWITCHING
   ===================================================================== */
function switchMode(m) {
  mode = m;
  const playing = m === 'play';
  $('btnPlay').classList.toggle('active', playing);
  $('btnEdit').classList.toggle('active', !playing);
  $('hud').style.display = playing ? 'block' : 'none';
  $('editorUI').classList.toggle('on', !playing);
  orbit.enabled = !playing;
  gizmo.enabled = !playing; gizmo.visible = !playing;
  if (!playing) {
    // entering editor: park a good orbit view, refresh panels
    camera.position.set(40, 30, 0); orbit.target.set(0, 1, 40);
    renderInspector(); renderHierarchy(); select(null);
    flashToast('Studio: click objects · G/R/S = move/rotate/scale');
  } else {
    gizmo.detach();
  }
}
$('btnPlay').onclick = () => switchMode('play');
$('btnEdit').onclick = () => switchMode('edit');

// boot in play mode
switchMode('play');

window.__VR.select = select;
window.__VR.editorUpdate = editorUpdate;
window.__VR.switchMode = switchMode;
window.__VR.gizmo = gizmo;
window.__VR.orbit = orbit;
})();
