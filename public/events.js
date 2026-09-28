'use strict';

// The aptitude test from eventos-test-orientacion-ml.md, placed on the building, plus everything
// else about the building the game and the phones need to agree on: its floors, its lift, its labs.
// `row` is the collision row of a floor, which is also what the player's feet rest on.
const CAREERS = {
  SIS: 'Ingeniería de Sistemas',
  ELN: 'Ingeniería Electrónica',
  ELE: 'Ingeniería Eléctrica',
  MEC: 'Ingeniería Mecánica',
  CIV: 'Ingeniería Civil',
  IND: 'Ingeniería Industrial',
  QUI: 'Ingeniería Química',
  AMB: 'Ingeniería Ambiental',
  DAT: 'Ciencia de Datos',
  BIO: 'Ingeniería Biomédica',
};

const EVENTS_PER_PLAYER = 4;   // each player answers this many rooms, then collects the result at the tree

// The floors, numbered as the lift and every screen show them. `doorFrom` marks a floor whose art
// has no lift door drawn — its door is painted on, copied from the door at that other floor's row.
const FLOORS = [
  { n: 'S1', row: 549, doorFrom: 479 },
  { n: 1, row: 479 },
  { n: 2, row: 423, doorFrom: 479 },
  { n: 3, row: 369 },
  { n: 4, row: 314 },
  { n: 5, row: 259 },
  { n: 6, row: 207 },
  { n: 7, row: 155 },
  { n: 8, row: 102 },
];
const TOP_FLOOR = FLOORS[FLOORS.length - 1].n;
const floorAt = (row) => FLOORS.find((f) => f.row === row);
const floorName = (row) => { const f = floorAt(row); return f ? `Piso ${f.n}` : 'Entrepiso'; };

// The lift: one shaft of doors at x, one stop per floor (door = its box, relative to row).
const LIFT = { x: 386, door: { x0: 372, x1: 404, top: -27, bottom: -5 } };

// The labs and named rooms, by key. Change a name, a room or a colour here and the map, the phones
// and the onboarding all follow. `room` is the room's span on the map [left wall, right wall]: its
// title hangs centred between them, and the room's ! (if it has one) hangs centred under the title.
// `signY` is the title's top, just under the ceiling. `area` is the engineering the room is about.
// A room gets an event only if some entry in EVENTS points at it: biotec is a title and nothing else.
const LABS = {
  ar:     { name: 'Colivri',                      room: [37, 214],  signY: 452, area: 'Sistemas y Biomédica',    color: '#b89cff' },
  elec:   { name: 'La Pecera',                    room: [404, 597], signY: 490, area: 'Electrónica y Eléctrica', color: '#ffb347' },
  mec:    { name: 'Lab de Manufactura',           room: [597, 808], signY: 497, area: 'Mecánica y Civil',        color: '#a9c1d6' },
  redes:  { name: 'Lab de Redes',                 room: [728, 956], signY: 326, area: 'Sistemas y Electrónica',  color: '#6ec6ff' },
  biotec: { name: 'Laboratorio de Biotecnología', room: [37, 245],  signY: 268, area: 'Biomédica y Química',     color: '#c5e86c' },
  quim:   { name: 'Lab de Bioreactores',          room: [728, 988], signY: 268, area: 'Química y Ambiental',     color: '#86e08a' },
  robot:  { name: 'Lab AIA',                      room: [728, 988], signY: 216, area: 'Industrial y Mecánica',   color: '#ff8a65' },
  bio:    { name: 'Lab Ingeniería de Tejidos',    room: [422, 727], signY: 164, area: 'Biomédica y Datos',       color: '#ff9ecf' },
  prof:   { name: 'Oficinas de Profesores',       room: [488, 985], signY: 111, area: 'Civil y Ambiental',       color: '#e6d36a' },
};
for (const lab of Object.values(LABS)) lab.x = Math.round((lab.room[0] + lab.room[1]) / 2);

const EVENTS = [
  {
    id: 1, item: 'AR Goggles', lab: 'ar', row: 549,
    context: 'La demo de realidad aumentada es hoy, pero las paredes salen flotando y todos se marean.',
    question: '¿Qué haces?',
    options: [
      { t: 'Te metes al código a buscar el bug.', s: { SIS: 3, DAT: 1 } },
      { t: 'Revisas los sensores y cables de las gafas.', s: { ELN: 3, MEC: 1 } },
      { t: 'Comparas el modelo 3D con los planos reales.', s: { CIV: 3, MEC: 1 } },
      { t: 'Ajustas la imagen para que no maree a nadie.', s: { BIO: 3, SIS: 1 } },
      { t: 'Listas las fallas y arrancas por la que más se repite.', s: { IND: 3, SIS: 1 } },
    ],
  },
  {
    id: 2, item: 'Electronics Board', lab: 'elec', row: 549,
    context: 'Alguien dejó a medias una alarma para la puerta. Está armada, pero no suena.',
    question: '¿Qué haces?',
    options: [
      { t: 'Vuelves a soldar las conexiones flojas.', s: { ELN: 3, ELE: 1 } },
      { t: 'Mides si le está llegando suficiente energía.', s: { ELE: 3, ELN: 1 } },
      { t: 'Revisas el código que controla la alarma.', s: { SIS: 3, ELN: 1 } },
      { t: 'Imprimes en 3D un soporte para que el sensor no se mueva.', s: { MEC: 3, ELN: 1 } },
      { t: 'La pruebas 20 veces y anotas cuándo falla.', s: { DAT: 3, IND: 1 } },
    ],
  },
  {
    id: 3, item: 'Gear & Piston', lab: 'mec', row: 549,
    context: 'La máquina del lab vibra tanto que tuerce las piezas y riega aceite por todo lado.',
    question: '¿Qué haces?',
    options: [
      { t: 'La desarmas para ver qué pieza está gastada.', s: { MEC: 3, ELE: 1 } },
      { t: 'Revisas si la base del piso quedó floja.', s: { CIV: 3, MEC: 1 } },
      { t: 'Mides si al motor le llega energía pareja.', s: { ELE: 3, MEC: 1 } },
      { t: 'Recoges la viruta y el aceite para reciclarlos.', s: { AMB: 3, IND: 1 } },
      { t: 'Pruebas qué aceite aguanta mejor sin regarse.', s: { QUI: 3, AMB: 1 } },
    ],
  },
  {
    id: 4, item: 'Network Rack', lab: 'redes', row: 369,
    context: 'El wifi del edificio se cae a cada rato, justo en semana de entregas.',
    question: '¿Qué haces?',
    options: [
      { t: 'Revisas cable por cable en el rack.', s: { ELN: 3, SIS: 1 } },
      { t: 'Revisas la configuración de la red en los computadores.', s: { SIS: 3, DAT: 1 } },
      { t: 'Mides si la corriente del rack se mantiene estable.', s: { ELE: 3, DAT: 1 } },
      { t: 'Anotas cada caída y buscas un patrón.', s: { DAT: 3, IND: 1 } },
      { t: 'Calculas a cuántos afecta y decides qué arreglar primero.', s: { IND: 3, SIS: 1 } },
    ],
  },
  {
    id: 5, item: 'Chemistry Flasks', lab: 'biotec', row: 314,
    context: 'Hay frascos sin marcar en la mesa y huele raro. Nadie puede usar el lab.',
    question: '¿Qué haces?',
    options: [
      { t: 'Les haces pruebas para saber qué tienen.', s: { QUI: 3, BIO: 1 } },
      { t: 'Averiguas cómo desecharlos sin contaminar.', s: { AMB: 3, QUI: 1 } },
      { t: 'Revisas por qué no prende el extractor de aire.', s: { ELN: 3, ELE: 1 } },
      { t: 'Despejas la salida y marcas la ruta de evacuación.', s: { CIV: 3, AMB: 1 } },
      { t: 'Buscas de qué investigación son y le preguntas al grupo.', s: { BIO: 3, QUI: 1 } },
    ],
  },
  {
    id: 6, item: 'Robot Arm', lab: 'robot', row: 259,
    context: 'El brazo robot se frena a mitad de camino y tira las piezas. La demo es en 2 horas.',
    question: '¿Qué haces?',
    options: [
      { t: 'Corriges el programa de movimientos del brazo.', s: { SIS: 3, MEC: 1 } },
      { t: 'Aprietas tornillos y revisas si la base se mueve.', s: { MEC: 3, CIV: 1 } },
      { t: 'Mides si le falta energía cuando hace fuerza.', s: { ELE: 3, ELN: 1 } },
      { t: 'Cronometras cada ciclo y reordenas los pasos.', s: { IND: 3, AMB: 1 } },
      { t: 'Anotas dónde se frena cada vez y buscas el patrón.', s: { DAT: 3, ELE: 1 } },
    ],
  },
  {
    id: 7, item: 'Microscopio Biomédico', lab: 'bio', row: 207,
    context: 'Un grupo de investigación tiene cientos de imágenes y muestras en desorden. Necesitan saber cuáles sirven.',
    question: '¿Qué haces?',
    options: [
      { t: 'Revisas las imágenes con alguien del área de salud.', s: { BIO: 3, DAT: 1 } },
      { t: 'Organizas todo y buscas qué tienen en común las malas.', s: { DAT: 3, BIO: 1 } },
      { t: 'Pruebas cuáles muestras se dañaron.', s: { QUI: 3, BIO: 1 } },
      { t: 'Armas un sistema de etiquetas y un orden de revisión.', s: { IND: 3, QUI: 1 } },
      { t: 'Separas lo dañado y averiguas cómo desecharlo bien.', s: { AMB: 3, QUI: 1 } },
    ],
  },
  {
    id: 8, item: "Professor's Chalkboard", lab: 'prof', row: 155,
    context: 'En la tarde, la oficina de un profe se vuelve un horno y el aire no circula. Te pide ayuda.',
    question: '¿Qué haces?',
    options: [
      { t: 'Ves por dónde entra el sol y diseñas cómo taparlo.', s: { CIV: 3, AMB: 1 } },
      { t: 'Destapas el ventilador y sigues el ducto del aire.', s: { MEC: 3, ELE: 1 } },
      { t: 'Propones plantas o sombra natural para bajar el calor.', s: { AMB: 3, CIV: 1 } },
      { t: 'Buscas una capa para el vidrio que frene el calor.', s: { QUI: 3, CIV: 1 } },
      { t: 'Mides cómo afecta el calor a quienes trabajan ahí.', s: { BIO: 3, DAT: 1 } },
    ],
  },
];
// each event's place, room and floor come from the tables above, never typed in twice: its ! hangs
// centred on its lab's title
for (const ev of EVENTS) { ev.x = LABS[ev.lab].x; ev.room = LABS[ev.lab].name; ev.floor = floorName(ev.row); }

// The tree on the roof terrace, top right: once a player has answered all their events, pressing
// the action button beside it hands over their top 3 careers. The marker sits on the terrace just left of the
// planter; the planter itself (x0..x1, from its rim down to the terrace) is made solid, since the
// map art gives it no floor underneath and players would otherwise drop through it.
const GOAL = { x: 938, row: 102, planter: { x0: 948, x1: 983, top: 90, bottom: 104 } };
// {act} in a message stands for the action button: the phone shows its icon there
const GOAL_TEXT = `Sube al piso ${TOP_FLOOR} y ve al árbol de la esquina superior derecha. Oprime {act} junto a él para ver tus resultados.`;

// All the points each career has on offer across the 40 options. They are not equal (15 to 17),
// so the ranking divides by this first — the correction the test document asks for.
const CAREER_MAX = (() => {
  const max = {};
  for (const k of Object.keys(CAREERS)) max[k] = 0;
  for (const ev of EVENTS) for (const o of ev.options)
    for (const k of Object.keys(o.s)) max[k] += o.s[k];
  return max;
})();

function ranking(score) {
  return Object.keys(CAREERS)
    .map((k) => ({ key: k, name: CAREERS[k], points: score[k] || 0, pct: Math.round(((score[k] || 0) / CAREER_MAX[k]) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.points - a.points);
}
