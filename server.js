import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
};

const ROUTES = { '/': 'game.html', '/controller': 'controller.html' };

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ port: PORT, ips: lanAddresses() }));
  }
  const rel = ROUTES[url.pathname] ?? decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// Roles: "game" (the screen) and "controller" (a phone). Every phone is its own player.
// Controller input is relayed to every game tagged with the phone's id and slot (1, 2, 3, ...).
// A phone brings a key it keeps across reloads; its id is made from it, so a phone that reconnects
// is the same player again (the game keeps its answers), and it gets its old slot (colour) back.
const wss = new WebSocketServer({ server, path: '/ws' });
const games = new Set();
const controllers = new Set();
const slotOf = new Map();   // phone key -> the slot it last had
// phone id -> its sign-up: the email (null without the personal-data authorization) and both
// authorizations, sent on with the student's results to Google Sheets (see recordResult)
const registrations = new Map();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let nextId = 1;

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

// ---- Google Sheets: each finished game becomes one row, through the Apps Script web app in
// tools/google-sheets.gs. SHEETS_URL is that web app's /exec URL and SHEETS_SECRET the secret set
// in its script properties; without them results are only logged here.
const SHEETS_URL = process.env.SHEETS_URL || '';
const SHEETS_SECRET = process.env.SHEETS_SECRET || '';
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
async function recordResult(msg) {
  const reg = registrations.get(msg.player) || {};
  // name and phone are personal data: kept only if the student authorized it at sign-up
  const personal = reg.personal === true;
  const top = Array.isArray(msg.top) ? msg.top : [];
  const row = {
    fecha: new Date().toISOString(),
    jugador: clip(msg.player, 60),
    nombre: personal ? clip(msg.name, 80) : '',
    telefono: personal ? clip(msg.phone, 30) : '',
    correo: personal ? clip(reg.email, 254) : '',
    autoriza_personales: reg.personal === true ? 'Sí' : reg.personal === false ? 'No' : '',
    autoriza_sensibles: reg.sensitive === true ? 'Sí' : reg.sensitive === false ? 'No' : '',
    carrera_1: clip(top[0]?.name, 60), porcentaje_1: top[0]?.pct ?? '',
    carrera_2: clip(top[1]?.name, 60), porcentaje_2: top[1]?.pct ?? '',
    carrera_3: clip(top[2]?.name, 60), porcentaje_3: top[2]?.pct ?? '',
    puntos: JSON.stringify(msg.points || {}),
    respuestas: (Array.isArray(msg.answers) ? msg.answers : []).map((a) => `${clip(a.lab, 60)} (evento ${Number(a.ev)}): ${clip(a.choice, 1)} — ${clip(a.text, 120)}`).join(' | '),
  };
  if (!SHEETS_URL) { console.log('resultado (SHEETS_URL no configurada, no se envía):', JSON.stringify(row)); return; }
  try {
    const r = await fetch(SHEETS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: SHEETS_SECRET, row }) });
    const out = await r.text();
    if (!r.ok || !/"ok"\s*:\s*true/.test(out)) console.error('Google Sheets rechazó el resultado:', r.status, out.slice(0, 200));
  } catch (e) { console.error('No se pudo enviar el resultado a Google Sheets:', e.message); }
}
function broadcast(set, msg) { for (const ws of set) send(ws, msg); }
// what a phone's character looks like: 'm' or 'f', plus a skin and a hair colour (0-2, see colors.js)
function readLook(o) {
  const n = (v) => { const k = Number(v); return Number.isInteger(k) && k >= 0 && k <= 2 ? k : 0; };
  return { c: o.c === 'f' ? 'f' : 'm', skin: n(o.skin), hair: n(o.hair) };
}
function freeSlot(wanted) {
  const used = new Set([...controllers].map((c) => c.slot));
  if (wanted && !used.has(wanted)) return wanted;
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// Phones that lock or lose signal often vanish without a close; ping everyone and drop whoever stops
// answering, so their character leaves the screen instead of standing there forever.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const params = new URL(req.url, 'http://x').searchParams;
  const role = params.get('role');
  if (role === 'game') {
    games.add(ws);
    for (const c of controllers) send(ws, { t: 'join', id: c.id, slot: c.slot, look: c.look });
    // the game speaks back to one phone at a time: a question to answer, or its result
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'record') { recordResult(msg); return; }   // a finished game, for Google Sheets
      if (!msg.id) return;
      for (const c of controllers) if (c.id === msg.id) send(c, msg);
    });
    ws.on('close', () => { games.delete(ws); broadcast(controllers, { t: 'status', games: games.size }); });
    broadcast(controllers, { t: 'status', games: games.size });
    return;
  }

  const key = /^[a-z0-9]{8,40}$/i.test(params.get('key') || '') ? params.get('key') : null;
  ws.id = key ? `k${key}` : `p${nextId++}`;
  // the same phone twice (a reconnect racing the old socket's close): the new one takes over quietly
  for (const c of controllers) if (c.id === ws.id) { c.replaced = true; controllers.delete(c); ws.slot = c.slot; c.close(); }
  ws.slot = ws.slot || freeSlot(key && slotOf.get(key));
  ws.look = readLook({ c: params.get('char'), skin: params.get('skin'), hair: params.get('hair') });
  if (key) slotOf.set(key, ws.slot);
  controllers.add(ws);
  send(ws, { t: 'hello', id: ws.id, slot: ws.slot, games: games.size });
  broadcast(games, { t: 'join', id: ws.id, slot: ws.slot, look: ws.look });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'input') broadcast(games, { t: 'input', id: ws.id, slot: ws.slot, look: ws.look, s: msg.s });
    else if (msg.t === 'register') {
      const personal = msg.personal === true, sensitive = msg.sensitive === true;
      const email = personal && typeof msg.email === 'string' && msg.email.length <= 254 && EMAIL_RE.test(msg.email) ? msg.email : null;
      registrations.set(ws.id, { email, personal, sensitive, at: registrations.get(ws.id)?.at || new Date().toISOString() });
    }
    else if (msg.t === 'look') { ws.look = readLook(msg); broadcast(games, { t: 'look', id: ws.id, look: ws.look }); }
    else if (msg.t === 'finish') broadcast(games, { t: 'finish', id: ws.id, name: String(msg.name || '').slice(0, 80), phone: String(msg.phone || '').slice(0, 30) });
    else if (['answer', 'seen', 'floor', 'liftClose'].includes(msg.t)) broadcast(games, { ...msg, id: ws.id, slot: ws.slot });
  });
  ws.on('close', () => {
    if (ws.replaced) return;   // its player lives on in the socket that took over
    controllers.delete(ws);
    broadcast(games, { t: 'leave', id: ws.id });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Juego:     http://localhost:${PORT}/`);
  for (const ip of lanAddresses()) console.log(`Control:   http://${ip}:${PORT}/controller   (abrir en el telefono)`);
});
