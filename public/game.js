'use strict';

// ---------- constants ----------
const W = 1024, H = 576;
const HB_W = 10, HB_H = 15;            // hitbox in world px; sprite frames are drawn at native 16px (1 sprite px = 1 map px)
const GRAVITY = 1400, MAX_FALL = 460;
const RUN_SPEED = 120, GROUND_ACC = 1200, AIR_ACC = 800, GROUND_FRIC = 1500;
const JUMP_V = 295, COYOTE = 0.1, JUMP_BUFFER = 0.12;   // one fixed ~31px hop: tables and steps (<=28px), never the floor above (>=34px)
const WALL_SLIDE = 45, WALL_SLIDE_FAST = 130;
const MAX_STEP = 12;   // a Suelos stair riser this short or less is auto-climbed by walking into it, not jumped

const WALL_JUMP_VX = 150, WALL_LOCK = 0.17;
const DASH_TIME = 0.18, DASH_SPEED = 300, DASH_COOLDOWN = 0.45;
const DROP_TIME = 0.18, DEATH_TIME = 1.4;
// players start (and come back after dying) outside, on the pavement at the building's entrance:
// the lobby stairs come down to it on the right. Each slot stands a little further along it.
const SPAWN = { x: 945, y: 500, spread: 14 };
const STEP = 1 / 60;
// a static NPC standing a bit left of the spawn point, forever idle — decoration only, no collision
const MONIS = { x: SPAWN.x - 26, y: SPAWN.y + 6, name: 'Monis' };
const DIEGO = { x: SPAWN.x - 20, y: SPAWN.y - 90 }; 

const SPRITES = {            // file, frames, fps, loop
  Idle:      { n: 4, fps: 6,  loop: true },
  Run:       { n: 5, fps: 14, loop: true },
  Jump:      { n: 1, fps: 1,  loop: true },
  Fall:      { n: 1, fps: 1,  loop: true },
  Dash:      { n: 1, fps: 1,  loop: true },
  Wallslide: { n: 4, fps: 10, loop: true },
  Death:     { n: 1, fps: 1,  loop: false },
};

// ---------- assets ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// kind map: 0 empty, 1 solid Suelos (never auto-stepped), 2 one-way flat Plataforma,
// 3 Plataforma stair — one-way (jump onto it, pass freely otherwise, even jumping
// straight up through one) until P.onStair says you're actually resting on it, then
// solid and auto-stepped like a staircase — 4 Suelos stair (always solid, always
// auto-stepped). Each layer is authored art, not a heuristic: a pixel's opacity IS
// its collision — read straight off the layer's alpha channel.
const ALPHA_SOLID = 128;   // alpha (0-255) at or above this counts as solid
const SURFACE_SINK = 4;    // stand this deep into a Suelos surface, so the feet overlap it, not float above it
const OBJECT_SINK = 2;     // Plataforma art is thinner, so its surfaces sink less
let kind;
function alphaMask(img) {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  const d = octx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let p = 0, i = 3; p < mask.length; p++, i += 4) if (d[i] >= ALPHA_SOLID) mask[p] = 1;
  return mask;
}
function buildCollision(suelos, plataforma, suelosEsc, plataformaEsc) {
  const ground = alphaMask(suelos), groundStairs = alphaMask(suelosEsc);
  const plat = alphaMask(plataforma), platStairs = alphaMask(plataformaEsc);
  kind = new Uint8Array(W * H);
  for (let i = 0; i < kind.length; i++) {
    // the escalera markers are the authority over their own layer's flat art: wherever one is
    // opaque, that pixel is stair collision, even if Suelos/Plataforma also drew ordinary art
    // underneath it. Below that, Plataforma wins over Suelos: an object only has to exist in the
    // Plataforma group to behave like one — Suelos underneath/behind it (a shadow, a shared
    // outline, art you don't want to hand-erase pixel-perfect) never turns it solid.
    if (groundStairs[i]) kind[i] = 4;
    else if (platStairs[i]) kind[i] = 3;
    else if (plat[i]) kind[i] = 2;
    else if (ground[i]) kind[i] = 1;
  }
  // the art's own top edge (outline, anti-aliasing) sits a little above where a surface should
  // really catch the feet, so sink flat surfaces a few px — same feel as the old heuristic. A
  // stair (3 or 4) is authored exactly as its hitbox: never sink into it, only the plain run above it
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (kind[y * W + x] === 0) { y++; continue; }
      let e = y, firstStair = -1;
      while (e < H && kind[e * W + x] !== 0) {
        const k = kind[e * W + x];
        if ((k === 3 || k === 4) && firstStair < 0) firstStair = e;
        e++;
      }
      const want = (kind[y * W + x] === 1 || kind[y * W + x] === 4) ? SURFACE_SINK : OBJECT_SINK;
      const limit = firstStair >= 0 ? firstStair - y : e - y - 1;
      const sink = Math.min(want, limit);
      for (let r = y; r < y + sink; r++) kind[r * W + x] = 0;
      y = e;
    }
  }
}
const K = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? 1 : kind[y * W + x];

// ---------- input (websocket + keyboard) ----------
// Every player (one per phone, plus an optional keyboard player) owns its input state and edge latches.
// Moving is left/right only: floors are changed by stairs or the lift, never by climbing or dropping.
const BUTTONS = ['left', 'right', 'jump', 'dash', 'act', 'die'];
const EDGE = ['jump', 'dash', 'act', 'die'];
const players = new Map();
let kbPlayer = null;

function onRemote(p, s) {
  for (const b of EDGE) if (s[b] && !p.input[b]) p.latch[b] = true;
  for (const b of BUTTONS) p.input[b] = !!s[b];
}
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', KeyZ: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash',
  KeyE: 'act', KeyK: 'die',
};
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
  if (e.code === 'KeyI') document.getElementById('bar').classList.toggle('hide');
  if (e.code === 'KeyC') { const p = keyboardPlayer(); p.look = { ...p.look, c: p.look.c === 'f' ? 'm' : 'f' }; }   // switch the keyboard player's character
});
addEventListener('dblclick', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); });
function keyboardPlayer() {
  if (!kbPlayer || !players.has('kb')) kbPlayer = addPlayer('kb', 0);
  return kbPlayer;
}
addEventListener('keydown', (e) => {
  const a = KEYMAP[e.code]; if (!a) return;
  e.preventDefault();
  const p = keyboardPlayer();
  if (!p.input[a] && EDGE.includes(a)) p.latch[a] = true;
  p.input[a] = true;
});
addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) { if (kbPlayer) kbPlayer.input[a] = false; e.preventDefault(); } });
const held = (a) => !!P.input[a];

// ---------- player ----------
let P;   // the player currently being updated / drawn
// A phone that drops its connection (screen lock, weak signal, a reload) comes back with the same id,
// so its player is parked here instead of thrown away: answers, score and place all survive.
const away = new Map();
function addPlayer(id, slot, look = { c: 'm', skin: 0, hair: 0 }) {
  let p = away.get(id);
  if (p) {
    away.delete(id);
    Object.assign(p, { slot, look, input: {}, latch: {}, asking: null, lift: false, near: null });
  } else {
    // answers: every event answered, in order ({ ev, choice }); student: name and phone, once the finale is done
    p = { id, slot, look, input: {}, latch: {}, score: {}, done: new Set(), answers: [], student: null, asking: null, lift: false, near: null };
    const prev = P; P = p; respawn(); P = prev;
  }
  players.set(id, p);
  sendProgress(p);
  updateStatus();
  return p;
}
function removePlayer(id) {
  const p = players.get(id);
  if (p && id !== 'kb') away.set(id, p);
  players.delete(id);
  if (id === 'kb') kbPlayer = null;
  updateStatus();
}
function respawn() {
  Object.assign(P, {
    x: SPAWN.x + (P.slot % 5) * SPAWN.spread, y: SPAWN.y, vx: 0, vy: 0, face: -1,
    ground: false, onStair: false, coyote: 0, jumpBuf: 0, wallDir: 0, grab: false,
    dashT: 0, dropT: 0, dashCd: 0, dashDir: 1, airDash: true, lockT: 0,
    dead: false, deadT: 0, anim: 'Fall', animT: 0,
  });
}

const solid = (k) => k === 1 || k === 4;   // blocks like a wall (Suelos, whether auto-steppable or not)
const oneWay = (k) => k === 2 || k === 3;   // Plataforma, flat or diagonal: solid only from above, drop-through-able
function groundBelow() {
  const x0 = Math.floor(P.x), row = Math.floor(P.y + HB_H);
  for (let x = x0; x < x0 + HB_W; x++) {
    const k = K(x, row);
    if (solid(k)) return true;
    if (oneWay(k) && P.dropT <= 0 && !oneWay(K(x, row - 1))) return true;
  }
  return false;
}
function onThinFloor() {
  const x0 = Math.floor(P.x), row = Math.floor(P.y + HB_H);
  let thin = false;
  for (let x = x0; x < x0 + HB_W; x++) { const k = K(x, row); if (solid(k)) return false; if (oneWay(k)) thin = true; }
  return thin;
}
// true only when actually resting on a Plataforma stair (kind 3), never on real Suelos ground —
// checked once per frame while grounded, so it stays put through a jump (jumping up through a
// stair from real ground below doesn't suddenly read as "mounted" mid-air) and only changes on
// an actual landing.
function standingOnStair() {
  const x0 = Math.floor(P.x), row = Math.floor(P.y + HB_H);
  let onGround = false, onThree = false;
  for (let x = x0; x < x0 + HB_W; x++) {
    const k = K(x, row);
    if (k === 1 || k === 4) onGround = true; else if (k === 3) onThree = true;
  }
  return onThree && !onGround;
}
function wallSide(dir) {
  const x = dir > 0 ? Math.floor(P.x) + HB_W : Math.floor(P.x) - 1;
  const y0 = Math.floor(P.y);
  for (let y = y0 + 1; y < y0 + HB_H - 1; y++) { const k = K(x, y); if (k === 1 || k === 4) return true; }
  return false;
}
function moveX(dx) {
  const dir = Math.sign(dx);
  let rem = Math.abs(dx);
  // a Plataforma stair (kind 3) is one-way — pass through freely, including jumping straight up
  // through one from below — until P.onStair says you're actually resting on it (set once per
  // frame in step(), only while grounded, so it never flips mid-air). Once mounted, it's solid
  // and auto-stepped exactly like a Suelos stair, so climbing or descending the rest of the
  // flight feels like a normal staircase.
  const onStair = P.onStair;
  while (rem > 0) {
    const s = Math.min(1, rem); rem -= s;
    const nx = P.x + dir * s;
    const col = dir > 0 ? Math.floor(nx) + HB_W - 1 : Math.floor(nx);
    const y0 = Math.floor(P.y);
    let leadingSolid = false;
    for (let y = y0; y < y0 + HB_H; y++) {
      const k = K(col, y);
      if (solid(k) || (k === 3 && onStair)) { leadingSolid = true; break; }
    }
    // the escalera marker (kind 4 always, kind 3 once mounted) is a thin diagonal line a few
    // columns ahead of where the plain fill it steps through first blocks, so "is this a stair
    // riser" is judged over a hitbox-width window ahead of the blocking edge, in the direction of
    // travel — a real wall never has a stair-kind pixel anywhere near it.
    const scanFrom = dir > 0 ? col : col - HB_W + 1, scanTo = dir > 0 ? col + HB_W - 1 : col;
    let hasStair = false;
    for (let x = scanFrom; x <= scanTo && !hasStair; x++)
      for (let y = y0; y < y0 + HB_H; y++) { const k = K(x, y); if (k === 4 || (k === 3 && onStair)) { hasStair = true; break; } }
    let blocked = leadingSolid;
    const hard = !hasStair;
    if (blocked && !hard) {
      for (let lift = 1; lift <= MAX_STEP; lift++) {
        let clear = true;
        for (let y = y0 - lift; y < y0 - lift + HB_H; y++) {
          const k = K(col, y);
          if (solid(k) || (k === 3 && onStair)) { clear = false; break; }
        }
        if (clear) { P.y -= lift; blocked = false; break; }
      }
    }
    if (blocked) { P.vx = 0; return; }
    P.x = nx;
  }
}
function moveY(dy) {
  const dir = Math.sign(dy);
  let rem = Math.abs(dy);
  while (rem > 0) {
    const s = Math.min(1, rem); rem -= s;
    const ny = P.y + dir * s;
    const x0 = Math.floor(P.x);
    if (dir > 0) {
      // rows just below the feet, the same row groundBelow() looks at, so landings snap to whole px
      const prev = Math.floor(P.y + HB_H), row = Math.floor(ny + HB_H);
      if (row > prev) {
        let land = false;
        for (let x = x0; x < x0 + HB_W; x++) {
          const k = K(x, row);
          if (solid(k) || (oneWay(k) && P.dropT <= 0 && !oneWay(K(x, prev)))) { land = true; break; }
        }
        if (land) { P.y = row - HB_H; P.vy = 0; P.ground = true; return; }
      }
    } else {
      const prev = Math.floor(P.y), row = Math.floor(ny);
      if (row < prev) {
        let hit = false;
        for (let x = x0; x < x0 + HB_W; x++) if (solid(K(x, row))) { hit = true; break; }
        if (hit) { P.vy = 0; return; }
      }
    }
    P.y = ny;
  }
}

function step(dt) {
  // answering (or picking a floor) takes as long as it takes: the character just stands still meanwhile
  if (P.asking || P.lift) { P.latch.jump = P.latch.dash = P.latch.act = P.latch.die = false; P.input = {}; }
  const left = held('left'), right = held('right'), down = held('down');
  const dirX = (right ? 1 : 0) - (left ? 1 : 0);
  const L = P.latch, jumpP = L.jump, dashP = L.dash, dieP = L.die;
  L.jump = L.dash = L.die = false;      // act is read by checkMarkers()

  P.animT += dt;
  if (dieP && !P.dead) { P.dead = true; P.deadT = 0; P.vx = 0; P.vy = -200; P.dashT = 0; setAnim('Death'); }

  if (P.dead) {
    P.deadT += dt;
    P.vy = Math.min(P.vy + GRAVITY * dt, MAX_FALL);
    P.vx *= 0.9;
    moveX(P.vx * dt); moveY(P.vy * dt);
    if (P.deadT > DEATH_TIME) respawn();
    return;
  }

  P.dropT -= dt; P.dashCd -= dt; P.lockT -= dt; P.dashT -= dt; P.jumpBuf -= dt; P.coyote -= dt;
  if (jumpP) P.jumpBuf = JUMP_BUFFER;

  P.ground = groundBelow();
  if (P.ground) {
    P.coyote = COYOTE; P.airDash = true;
    P.onStair = standingOnStair();
  }
  // down while standing on a thin floor: drop through to the floor below
  if (P.ground && down && P.dashT <= 0 && onThinFloor()) { P.dropT = DROP_TIME; P.ground = false; P.coyote = 0; P.y += 1; }
  P.wallDir = !P.ground ? (wallSide(1) ? 1 : wallSide(-1) ? -1 : 0) : 0;

  const dashing = P.dashT > 0;
  if (dashP && P.dashCd <= 0 && !dashing && (P.ground || P.airDash)) {
    P.dashT = DASH_TIME; P.dashCd = DASH_COOLDOWN; P.dashDir = dirX || P.face; P.face = P.dashDir;
    if (!P.ground) P.airDash = false;
    P.vy = 0;
  }

  const controlled = P.lockT <= 0 && P.dashT <= 0;

  if (P.dashT > 0) {
    P.vx = P.dashDir * DASH_SPEED; P.vy = 0;
  } else {
    if (controlled) {
      if (dirX) P.face = dirX;
      const target = dirX * RUN_SPEED;
      const acc = dirX === 0 ? (P.ground ? GROUND_FRIC : AIR_ACC * 0.6) : (P.ground ? GROUND_ACC : AIR_ACC);
      if (P.vx < target) P.vx = Math.min(P.vx + acc * dt, target);
      else if (P.vx > target) P.vx = Math.max(P.vx - acc * dt, target);
    } else if (P.ground) {
      P.vx *= 0.85;
    }

    // jump / wall jump
    if (P.jumpBuf > 0) {
      if (P.ground || P.coyote > 0) {
        P.vy = -JUMP_V; P.ground = false; P.coyote = 0; P.jumpBuf = 0;
      } else if (P.wallDir) {
        P.vx = -P.wallDir * WALL_JUMP_VX; P.vy = -JUMP_V * 0.95; P.face = -P.wallDir;
        P.lockT = WALL_LOCK; P.jumpBuf = 0; P.airDash = true; P.wallDir = 0;
      }
    }

    // wall grab: slide, or drop fast
    P.grab = P.wallDir !== 0 && P.lockT <= 0 && (dirX === P.wallDir || down);
    if (P.grab) {
      P.face = P.wallDir;
      if (down) P.vy = WALL_SLIDE_FAST;
      else if (P.vy > 0) P.vy = Math.min(P.vy, WALL_SLIDE);
    }

    // gravity — one weight, so every jump is the same height however long the button is held
    if (!P.ground) {
      P.vy = Math.min(P.vy + GRAVITY * dt, MAX_FALL);
      if (P.grab && !down && P.vy > WALL_SLIDE) P.vy = WALL_SLIDE;
    }
    if (P.ground && P.vy > 0) P.vy = 0;
    if (P.dropT > 0 && P.vy < 60) P.vy = 60;
  }
  if (P.dashT <= 0 && P.dashT > -dt) P.vx = Math.sign(P.vx) * Math.min(Math.abs(P.vx), RUN_SPEED * 1.15);

  P.ground = false;
  moveX(P.vx * dt);
  moveY(P.vy * dt);
  if (!P.ground) P.ground = P.vy >= 0 && groundBelow();

  // pick animation
  const moving = Math.abs(P.vx) > 20;
  if (P.dashT > 0) setAnim('Dash');
  else if (P.ground) setAnim(moving && dirX !== 0 ? 'Run' : 'Idle');
  else if (P.grab && P.wallDir) setAnim('Wallslide');
  else setAnim(P.vy < 0 ? 'Jump' : 'Fall');
}
function setAnim(a) { if (P.anim !== a) { P.anim = a; P.animT = 0; } }

// ---------- the aptitude test, laid over the building ----------
// Each room in EVENTS floats an exclamation mark, lit for everyone since the screen is shared.
// Standing under one and pressing the action button sends its question to that player's phone; each
// player answers any EVENTS_PER_PLAYER of them, never the same one twice. After the last one they are
// sent up to Séneca on the roof (GOAL), where the action button starts the finale on the phone: a
// congratulation, the student's name and phone, and then their top 3 careers. That result, with the
// answers, goes to the server to be recorded (Google Sheets).
// The same button, in front of a lift door, opens the lift's floor panel on the phone.
let ws = null;
const toPhone = (id, msg) => { if (ws && ws.readyState === 1 && id !== 'kb') ws.send(JSON.stringify({ ...msg, id })); };
const atMarker = (p, m) => p.ground && Math.abs(p.x + HB_W / 2 - m.x) < 14 && Math.abs(p.y + HB_H - m.row) <= 4;
const finished = (p) => p.done.size >= EVENTS_PER_PLAYER;
const liftStop = (p) => FLOORS.find((f) => atMarker(p, { x: LIFT.x, row: f.row }));

function askEvent(p, ev) {
  p.asking = ev;
  const ask = {
    t: 'ask', ev: ev.id, room: ev.room, floor: ev.floor, item: ev.item, context: ev.context,
    question: ev.question, options: ev.options.map((o) => o.t),
  };
  toPhone(p.id, ask);
  if (p.id === 'kb') localQuiz(ask);
}
function closeAsk(p) {
  p.asking = null;
  toPhone(p.id, { t: 'close' });
  if (p.id === 'kb') localQuiz(null);
}
function answerEvent(p, choice) {
  const ev = p.asking;
  if (!ev || !(choice >= 0 && choice < ev.options.length)) return;
  for (const [k, v] of Object.entries(ev.options[choice].s)) p.score[k] = (p.score[k] || 0) + v;
  p.done.add(ev.id);
  p.answers.push({ ev: ev.id, choice });
  // no 'close' to the phone: its question stays up until this 'saved' replaces it with how many
  // events are left (or, after the last one, where Séneca is), so the controls never flash between them
  p.asking = null;
  if (p.id === 'kb') localQuiz(null);
  sendProgress(p);
  toPhone(p.id, { t: 'saved', room: ev.room, collected: p.done.size, total: EVENTS_PER_PLAYER, next: GOAL_TEXT });
}
// The finale at Séneca: the phone congratulates the student and asks for their name and phone. Once
// that comes back (finishGame), the result is shown and recorded; afterwards Séneca just shows it again.
function startFinale(p) {
  if (p.student || p.id === 'kb') { sendResult(p); return; }
  toPhone(p.id, { t: 'finale' });
}
function finishGame(p, name, phone) {
  if (!finished(p)) return;
  if (p.student) { sendResult(p); return; }   // already recorded: never twice
  p.student = { name: String(name || '').slice(0, 80), phone: String(phone || '').slice(0, 30) };
  sendResult(p);
  const top = ranking(p.score);
  // not to a phone: the server records it (see server.js)
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({
    t: 'record', player: p.id, slot: p.slot, name: p.student.name, phone: p.student.phone,
    top: top.slice(0, 3).map((c) => ({ key: c.key, name: c.name, pct: c.pct, points: c.points })),
    points: Object.fromEntries(top.map((c) => [c.key, c.points])),
    answers: p.answers.map(({ ev, choice }) => { const e = EVENTS.find((x) => x.id === ev); return { ev, lab: e.room, choice: 'ABCDE'[choice], text: e.options[choice].t }; }),
  }));
}
// how far along a player is goes to their own phone only, never onto the shared screen
function sendProgress(p) { toPhone(p.id, { t: 'progress', collected: p.done.size, total: EVENTS_PER_PLAYER }); }
function sendResult(p) {
  const res = {
    t: 'result', collected: p.done.size, total: EVENTS_PER_PLAYER,
    top: ranking(p.score).slice(0, 3).map((c) => ({ name: c.name, pct: c.pct, points: c.points })),
  };
  toPhone(p.id, res);
  if (p.id === 'kb') localQuiz(res);
}
// a short message on the player's phone; `stay` keeps it up until they close it
function notice(p, title, text, stay = false) {
  const m = { t: 'notice', title, text, stay };
  toPhone(p.id, m);
  if (p.id === 'kb') localQuiz(m);
}

// the lift: the phone shows a panel with every floor, and the chosen one moves the player there
function openLift(p, from) {
  p.lift = true;
  const m = { t: 'lift', current: from.n, floors: FLOORS.map((f) => f.n) };
  toPhone(p.id, m);
  if (p.id === 'kb') localQuiz(m);
}
function closeLift(p) {
  p.lift = false;
  if (p.id === 'kb') localQuiz(null);
}
function rideLift(p, n) {
  const to = FLOORS.find((f) => f.n === n);
  if (!p.lift || !to) return;
  Object.assign(p, { x: LIFT.x - HB_W / 2, y: to.row - HB_H, vx: 0, vy: 0, ground: true, dashT: 0, jumpBuf: 0 });
  closeLift(p);
}

function setNear(p, id) {
  if (p.near === id) return;
  p.near = id;
  toPhone(p.id, { t: 'near', on: id !== null });   // the phone lights up its action button
}
// runs after step(), so the action latch is still set: nothing fires by just walking past a marker
function checkMarkers(p) {
  const act = p.latch.act; p.latch.act = false;
  if (p.dead || p.asking || p.lift) return;
  const done = finished(p), atGoal = atMarker(p, GOAL), stop = liftStop(p);
  const ev = atGoal || stop ? null : EVENTS.find((e) => atMarker(p, e));
  // the button only lights up where it will do something: the lift, an unanswered event, or Séneca once finished
  setNear(p, stop ? 'lift' : atGoal ? (done ? 'goal' : null) : ev && !done && !p.done.has(ev.id) ? ev.id : null);
  if (!act) return;
  if (stop) openLift(p, stop);
  else if (atGoal) {
    if (done) startFinale(p);
    else {
      const left = EVENTS_PER_PLAYER - p.done.size;
      notice(p, 'Todavía no', `Te ${left === 1 ? 'falta 1 evento' : `faltan ${left} eventos`}. Respóndelos y vuelve con Séneca para ver tus resultados.`);
    }
  } else if (ev) {
    if (done) notice(p, 'Ya completaste tus eventos', GOAL_TEXT);
    else if (p.done.has(ev.id)) notice(p, 'Ya respondiste este evento', 'Busca otro signo de admiración y oprime {act} debajo de él.');
    else askEvent(p, ev);
  }
}

// The building is composited from its 5 layers, back to front. Floors whose art has no lift door
// drawn (`doorFrom` set) get one painted on, copied from another floor's door. The signs — floor
// numbers, lab titles, the key in the sky — go on their own canvas instead (drawSigns, below).
function paintBuilding(otroFondo, background, suelos, plataforma, decoracion) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(otroFondo, 0, 0);   // the backmost layer: everything else is drawn over it
  g.drawImage(background, 0, 0);
  g.drawImage(suelos, 0, 0);
  g.drawImage(plataforma, 0, 0);
  g.drawImage(decoracion, 0, 0);
  const d = LIFT.door, w = d.x1 - d.x0 + 1, h = d.bottom - d.top + 1;
  for (const f of FLOORS) {
    if (!f.doorFrom) continue;
    // copy the door pixel by pixel, leaving out the wall behind it (the wood of the floor it comes
    // from), so it sits on this floor's own wall, in front of the desk there so the lift stays easy to spot
    const src = g.getImageData(d.x0, f.doorFrom + d.top, w, h), dst = g.getImageData(d.x0, f.row + d.top, w, h);
    const wall = [src.data[0], src.data[1], src.data[2]];
    const isWall = (i) => Math.abs(src.data[i] - wall[0]) + Math.abs(src.data[i + 1] - wall[1]) + Math.abs(src.data[i + 2] - wall[2]) < 40;
    for (let i = 0; i < src.data.length; i += 4) if (!isWall(i)) for (let k = 0; k < 4; k++) dst.data[i + k] = src.data[i + k];
    g.putImageData(dst, d.x0, f.row + d.top);
  }
  return c;
}
// The signs are text, so they are drawn smooth at the screen's resolution on a canvas laid exactly over
// the map (same box, same object-fit), not as pixel art. They never move, so this only runs when the
// window changes size.
const signs = document.getElementById('signs');
function drawSigns() {
  const S = Math.max(2, Math.min(4, Math.ceil(Math.max(innerWidth / W, innerHeight / H) * (devicePixelRatio || 1))));
  signs.width = W * S; signs.height = H * S;
  const g = signs.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  g.imageSmoothingEnabled = false;   // the few pixel-art icons in the key stay crisp
  for (const f of FLOORS) drawFloorTag(g, LIFT.x, f.row + LIFT.door.top - 12, f.n);
  for (const lab of Object.values(LABS)) drawLabSign(g, lab.x, lab.signY, lab);
  drawMapKey(g);
}
let signsTimer = null;
addEventListener('resize', () => { clearTimeout(signsTimer); signsTimer = setTimeout(drawSigns, 150); });
// The key along the sky above the roof, for everyone watching the big screen: each symbol the map
// uses, drawn by the same code as on the map, with what it means. The phones explain it too.
const MAP_KEY = [
  { icon: (g, x, y) => drawBang(g, x, y + 7), title: 'Evento', text: ['Párate debajo y oprime', 'el botón de tu celular'] },
  { icon: (g, x, y) => drawActButton(g, x, y), title: 'Botón de la mano', text: ['Sale sobre ti cuando', 'puedes interactuar'] },
  { icon: (g, x, y) => drawFloorTag(g, x, y - 6, 3), title: 'Ascensor y piso', text: ['En la puerta oprime el', `botón y elige S1 a ${TOP_FLOOR}`] },
  { icon: (g, x, y) => drawLabSign(g, x, y - 6, { name: 'Lab', color: LABS.elec.color }), title: 'Laboratorio', text: ['Su nombre va en el', 'letrero de color'] },
  { icon: (g, x, y) => drawStar(g, x, y + 6), title: `Séneca (piso ${TOP_FLOOR})`, text: [`Con ${EVENTS_PER_PLAYER} eventos listos,`, 've por tus resultados'] },
];
function drawMapKey(g) {
  const x0 = 24, y0 = 4, w = 880, h = 50, cell = w / MAP_KEY.length;
  plaque(g, x0 + 0.5, y0 + 0.5, w - 1, h - 1, '#f3ead2');
  g.fillStyle = '#d9c9a3'; g.fillRect(x0 + 2, y0 + h - 4, w - 4, 2);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  MAP_KEY.forEach((k, i) => {
    const cx = x0 + i * cell;
    if (i) { g.fillStyle = '#9e8572'; g.fillRect(cx, y0 + 6, 1, h - 14); }
    k.icon(g, cx + 22, y0 + 22);
    g.fillStyle = '#2b2118'; g.textAlign = 'left';
    g.font = `700 10px ${SIGN_FONT_FAMILY}`; g.fillText(k.title, cx + 40, y0 + 15);
    g.font = `9px ${SIGN_FONT_FAMILY}`;
    k.text.forEach((t, j) => g.fillText(t, cx + 40, y0 + 27 + j * 10));
  });
}
function drawMarkers(t) {
  drawStar(ctx, GOAL.x, GOAL.row - 20 + Math.round(Math.sin(t * 2.2) * 2));
  // each ! bobs just above head height, under its lab's title (a floor is too low for more swing)
  for (const ev of EVENTS) {
    const by = ev.row - 18 + Math.round(Math.sin(t * 2.2 + ev.id));
    drawBang(ctx, ev.x, by);   // always lit: the screen is shared, so a marker never goes out for everyone
  }
}

// the same panels on the game screen, for whoever is playing on the keyboard
const quizBox = document.getElementById('quiz');
const kbText = (s) => s.replace(/\{act\}/g, '<kbd>E</kbd>');
function localQuiz(m) {
  if (!m) { quizBox.classList.add('hide'); return; }
  quizBox.classList.remove('hide');
  if (m.t === 'notice') {
    quizBox.innerHTML = `<h2>${m.title}</h2><p>${kbText(m.text)}</p>`;
    if (!m.stay) setTimeout(() => { if (quizBox.innerHTML.includes(m.title)) localQuiz(null); }, 2500);
    return;
  }
  if (m.t === 'lift') {
    const nums = m.floors.filter((n) => n !== 'S1');
    quizBox.innerHTML = `<h2>Ascensor · estás en el piso ${m.current}</h2>` +
      `<p>Elige piso: <kbd>0</kbd>=S1, teclas ${nums[0]}–${nums[nums.length - 1]} · <kbd>Esc</kbd> para salir</p>`;
    return;
  }
  if (m.t === 'result') {
    quizBox.innerHTML = `<h2>Top 3 · ${m.collected}/${m.total} respondidas</h2>` +
      (m.top.length ? m.top.map((c, i) => `<p class="rank"><b>${i + 1}. ${c.name}</b> — ${c.pct}%</p>`).join('') : '<p>Responde algún evento primero.</p>');
    return;
  }
  quizBox.innerHTML = `<h2>${m.room} · ${m.floor}</h2><p>${m.context}</p><p><b>${m.question}</b></p>` +
    m.options.map((o, i) => `<p class="opt"><b>${i + 1}</b> ${o}</p>`).join('') +
    `<p class="hint">Responde con las teclas 1–5</p>`;
}
addEventListener('keydown', (e) => {
  if (!kbPlayer) return;
  const n = parseInt(e.key, 10);
  if (kbPlayer.asking && n >= 1 && n <= 5) { answerEvent(kbPlayer, n - 1); e.preventDefault(); }
  else if (kbPlayer.lift && e.key === '0') { rideLift(kbPlayer, 'S1'); e.preventDefault(); }
  else if (kbPlayer.lift && n >= 1) { rideLift(kbPlayer, n); e.preventDefault(); }
  else if (kbPlayer.lift && e.key === 'Escape') closeLift(kbPlayer);
});

// ---------- render ----------
let bg; const sheets = { m: {}, f: {} };   // character ('m' or 'f') -> { anim: image }
let monisImg;   // the standalone Monis NPC, drawn separately from the players' sprite sheets
let diegoImg;   // same idea as Monis, 16-frame idle sheet, no name tag
const tinted = new Map();      // slot + look -> { anim: canvas }, the sheets in the slot's shirt colour and the player's skin and hair (colors.js)
const tagColor = (p) => colorFor(p.slot);

function tintedSheets(slot, look) {
  const key = `${slot}${look.c}${look.skin}${look.hair}`;
  if (tinted.has(key)) return tinted.get(key);
  const out = {};
  for (const [name, img] of Object.entries(sheets[look.c])) out[name] = recolorSheet(img, { shirt: colorFor(slot), skin: look.skin, hair: look.hair });
  tinted.set(key, out);
  return out;
}

function drawPlayer() {
  const def = SPRITES[P.anim], img = tintedSheets(P.slot, P.look)[P.anim];
  let f = Math.floor(P.animT * def.fps);
  f = def.loop ? f % def.n : Math.min(f, def.n - 1);
  if (P.dead && P.deadT > DEATH_TIME - 0.4 && Math.floor(P.deadT * 20) % 2) return; // blink before respawn
  // the depth overlap lives in the collision mask (SURFACE_SINK), so the feet are drawn where they really are
  const cx = Math.round(P.x + HB_W / 2), by = Math.round(P.y + HB_H);
  ctx.save();
  ctx.translate(cx, by);
  if (P.face < 0) ctx.scale(-1, 1);
  const ox = P.anim === 'Wallslide' ? -3 : 0;   // keep the hand on the wall, not inside it
  ctx.drawImage(img, f * 16, 0, 16, 16, -8 + ox, -16, 16, 16);
  ctx.restore();
  // tiny tag over the head so players can tell each other apart
  ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tagColor(P);
  ctx.fillText(P.slot === 0 ? 'KB' : `P${P.slot}`, cx, by - 19);
  // standing where the action button does something: show that button over their head
  if (P.near !== null && !P.asking && !P.lift) drawActButton(ctx, cx, by - 32);
}
function drawMonis(t) {
  if (!monisImg) return;
  const def = SPRITES.Idle, f = Math.floor(t * def.fps) % def.n;
  const cx = Math.round(MONIS.x + HB_W / 2), by = Math.round(MONIS.y + HB_H);
  ctx.save();
  ctx.translate(cx, by);
  ctx.drawImage(monisImg, f * 16, 0, 16, 16, -8, -16, 16, 16);
  ctx.restore();
  ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(MONIS.name, cx, by - 19);
}
function drawDiego(t) {
  if (!diegoImg) return;
  const fps = SPRITES.Idle.fps, n = 16, f = Math.floor(t * fps) % n;
  const cx = Math.round(DIEGO.x + HB_W / 2), by = Math.round(DIEGO.y + HB_H);
  ctx.save();
  ctx.translate(cx, by);
  ctx.drawImage(diegoImg, f * 16, 0, 16, 16, -8, -16, 16, 16);
  ctx.restore();
}
function draw(t) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0);
  drawMarkers(t);
  drawMonis(t);
  drawDiego(t);
  for (const p of players.values()) { P = p; drawPlayer(); }
}

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { for (const p of players.values()) { P = p; step(STEP); checkMarkers(p); } acc -= STEP; }
  draw(now / 1000);
  requestAnimationFrame(frame);
}

// ---------- websocket ----------
const dot = document.getElementById('wsDot'), txt = document.getElementById('wsTxt');
let connected = false;
function updateStatus() {
  const phones = [...players.values()].filter((p) => p.id !== 'kb').length;
  dot.classList.toggle('on', phones > 0);
  txt.textContent = !connected ? 'desconectado, reintentando…' : phones ? `${phones} control${phones > 1 ? 'es' : ''} conectado${phones > 1 ? 's' : ''}` : 'servidor ok · esperando control';
}
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=game`);
  ws.onopen = () => { connected = true; updateStatus(); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'join') {
      const p = players.get(m.id);
      if (!p) addPlayer(m.id, m.slot, m.look);
      else {
        // the same phone again on a fresh connection: whatever panel it had open is gone, so let the
        // player open it again, and remind the phone how far along it is
        Object.assign(p, { slot: m.slot, look: m.look, asking: null, lift: false, near: null });
        sendProgress(p);
      }
    }
    else if (m.t === 'leave') removePlayer(m.id);
    else if (m.t === 'look') { const p = players.get(m.id); if (p) p.look = m.look; }
    else if (m.t === 'input') { if (!players.has(m.id)) addPlayer(m.id, m.slot, m.look); onRemote(players.get(m.id), m.s || {}); }
    else if (m.t === 'answer') { const p = players.get(m.id); if (p) answerEvent(p, m.choice); }
    else if (m.t === 'seen') { const p = players.get(m.id); if (p && p.asking) closeAsk(p); }
    else if (m.t === 'finish') { const p = players.get(m.id); if (p) finishGame(p, m.name, m.phone); }
    else if (m.t === 'floor') { const p = players.get(m.id); if (p) rideLift(p, m.n); }
    else if (m.t === 'liftClose') { const p = players.get(m.id); if (p) closeLift(p); }
  };
  ws.onclose = () => {
    connected = false; updateStatus(); setTimeout(connect, 1000);
    for (const id of [...players.keys()]) if (id !== 'kb') removePlayer(id);   // server re-announces them on reconnect
  };
}

const LAYERS = ['OtroFondo', 'Background', 'Suelos', 'Plataforma', 'Decoracion', 'Suelos-Escaleras', 'Plataforma-Escaleras'];
(async function init() {
  const [layers, monis, diego, ...imgs] = await Promise.all([
    Promise.all(LAYERS.map((n) => loadImg(`layers/${n}.png`))),
    loadImg('sprites/m/IdleMonis.png'),
    loadImg('sprites/m/IdleDiego.png'),
    ...Object.keys(SPRITES).map((n) => loadImg(`sprites/${n}.png`)),
    ...Object.keys(SPRITES).map((n) => loadImg(`sprites/f/${n}.png`)),
  ]);
  const [otroFondo, background, suelos, plataforma, decoracion, suelosEsc, plataformaEsc] = layers;
  monisImg = monis;
  diegoImg = diego;
  Object.keys(SPRITES).forEach((n, i) => { sheets.m[n] = imgs[i]; sheets.f[n] = imgs[i + Object.keys(SPRITES).length]; });
  buildCollision(suelos, plataforma, suelosEsc, plataformaEsc);   // the signs painted next must never become floors
  bg = paintBuilding(otroFondo, background, suelos, plataforma, decoracion);
  drawSigns();
  // disabled on purpose: this was the unexplained solid box Sergio kept finding in the art — it
  // isn't needed (the goal trigger is its own zone check, not tied to standing on the planter),
  // so it stays off. Suelos still covers the ledge under it (3 rows); only the pot itself is
  // walk-through now. Uncomment if the tree area ever needs to block movement again.
  // const pl = GOAL.planter;
  // for (let y = pl.top + SURFACE_SINK; y <= pl.bottom; y++) for (let x = pl.x0; x <= pl.x1; x++) kind[y * W + x] = 1;
  connect();
  fetch('/api/info').then((r) => r.json()).then((i) => {
    // on a LAN run, point phones at this PC's address; once deployed, the page's own origin is the one to share
    const local = /^(localhost|127\.)/.test(location.hostname);
    const url = local && i.ips[0] ? `http://${i.ips[0]}:${i.port}/controller` : `${location.origin}/controller`;
    const a = document.getElementById('ctrlUrl'); a.href = url; a.textContent = url;
  }).catch(() => {});
  requestAnimationFrame(frame);
})();
