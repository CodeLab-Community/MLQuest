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
    context: 'El recorrido en realidad aumentada del edificio se ve corrido: las paredes quedan flotando y la gente se marea. Hay demostración esta tarde.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Abres el programa del recorrido y buscas qué parte está poniendo mal las paredes.', s: { SIS: 3, DAT: 1 } },
      { t: 'Revisas los cables y los sensores del visor para ver cuál manda mal la posición.', s: { ELN: 3, MEC: 1 } },
      { t: 'Comparas el modelo con los planos reales y corriges las medidas del edificio.', s: { CIV: 3, MEC: 1 } },
      { t: 'Ajustas cómo se ve la imagen en cada ojo para que la vista la siga sin marear.', s: { BIO: 3, SIS: 1 } },
      { t: 'Armas un orden de pruebas y atacas primero la falla que más se repite.', s: { IND: 3, SIS: 1 } },
    ],
  },
  {
    id: 2, item: 'Electronics Board', lab: 'elec', row: 549,
    context: 'Un grupo dejó a medias una alarma que debería sonar cuando alguien abre la puerta. Está armada, pero no suena.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Sueldas de nuevo las conexiones que se ven flojas en la placa.', s: { ELN: 3, ELE: 1 } },
      { t: 'Mides cuánta energía le está llegando a la placa y si alcanza para el sonido.', s: { ELE: 3, ELN: 1 } },
      { t: 'Abres el código que maneja la alarma y buscas dónde está el error.', s: { SIS: 3, ELN: 1 } },
      { t: 'Imprimes en 3D un soporte para que el sensor quede fijo y no se mueva.', s: { MEC: 3, ELN: 1 } },
      { t: 'Pruebas la alarma veinte veces seguidas y anotas en qué casos falla.', s: { DAT: 3, IND: 1 } },
    ],
  },
  {
    id: 3, item: 'Gear & Piston', lab: 'mec', row: 549,
    context: 'La máquina grande del lab vibra tanto que deja las piezas torcidas, y riega viruta y aceite por el piso.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Desarmas la máquina y revisas qué pieza está suelta o desgastada.', s: { MEC: 3, ELE: 1 } },
      { t: 'Revisas si la base anclada al piso está floja y mides cuánto se mueve.', s: { CIV: 3, MEC: 1 } },
      { t: 'Mides si el motor está recibiendo la energía pareja o a golpes.', s: { ELE: 3, MEC: 1 } },
      { t: 'Recoges la viruta y el aceite y los separas para que se puedan reutilizar.', s: { AMB: 3, IND: 1 } },
      { t: 'Comparas los aceites disponibles y pruebas cuál aguanta mejor sin regarse.', s: { QUI: 3, AMB: 1 } },
    ],
  },
  {
    id: 4, item: 'Network Rack', lab: 'redes', row: 369,
    context: 'El internet del edificio se cae a ratos, justo cuando todos están entregando tareas. En el lab los equipos parpadean raro.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Sigues cable por cable en el estante de equipos y reconectas los que están mal puestos.', s: { ELN: 3, SIS: 1 } },
      { t: 'Miras desde qué computadores se cae y sigues la falla dentro del programa.', s: { SIS: 3, DAT: 1 } },
      { t: 'Mides si la corriente que llega al estante se mantiene estable o se baja.', s: { ELE: 3, DAT: 1 } },
      { t: 'Anotas cada caída con su hora y buscas el patrón de la semana.', s: { DAT: 3, IND: 1 } },
      { t: 'Calculas a cuánta gente le afecta y propones qué arreglar de primero.', s: { IND: 3, SIS: 1 } },
    ],
  },
  {
    id: 5, item: 'Chemistry Flasks', lab: 'quim', row: 314,
    context: 'Alguien dejó frascos sin marcar sobre la mesa y huele raro. Nadie sabe qué hay adentro y el lab no se puede usar.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Haces pruebas sencillas a cada frasco para identificar qué contiene.', s: { QUI: 3, BIO: 1 } },
      { t: 'Averiguas a dónde van esos residuos y separas lo que se puede reutilizar.', s: { AMB: 3, QUI: 1 } },
      { t: 'Destapas el extractor de aire que no prende y revisas el enchufe y las conexiones.', s: { ELN: 3, ELE: 1 } },
      { t: 'Despejas la salida de emergencia y marcas el camino seguro para salir.', s: { CIV: 3, AMB: 1 } },
      { t: 'Buscas en qué investigación se usaban esas muestras y hablas con quien la maneja.', s: { BIO: 3, QUI: 1 } },
    ],
  },
  {
    id: 6, item: 'Robot Arm', lab: 'robot', row: 259,
    context: 'El brazo robot se detiene a mitad de movimiento y bota las piezas al piso. El grupo que lo usa tiene demostración en dos horas.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Abres el programa que le dice al brazo qué movimiento hacer y lo corriges.', s: { SIS: 3, MEC: 1 } },
      { t: 'Aprietas los tornillos y revisas si la base del brazo se está moviendo.', s: { MEC: 3, CIV: 1 } },
      { t: 'Mides si le llega bien la energía justo cuando el brazo hace fuerza.', s: { ELE: 3, ELN: 1 } },
      { t: 'Cronometras cada vuelta y reordenas los pasos para que no se atasque ni bote material.', s: { IND: 3, AMB: 1 } },
      { t: 'Registras en qué punto exacto se detiene cada vez y buscas el patrón.', s: { DAT: 3, ELE: 1 } },
    ],
  },
  {
    id: 7, item: 'Microscopio', lab: 'bio', row: 207,
    context: 'Un grupo de investigación tiene cientos de imágenes y muestras guardadas sin ningún orden. Les urge saber qué sirve y qué no.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Comparas las imágenes junto a alguien del área de salud y marcas las que sirven.', s: { BIO: 3, DAT: 1 } },
      { t: 'Ordenas todo por fecha y tipo y buscas qué tienen en común las que no sirven.', s: { DAT: 3, BIO: 1 } },
      { t: 'Pruebas muestra por muestra cuáles se dañaron y cuáles todavía sirven.', s: { QUI: 3, BIO: 1 } },
      { t: 'Armas un sistema de etiquetas y defines en qué orden revisar todo.', s: { IND: 3, QUI: 1 } },
      { t: 'Separas lo que ya no sirve y averiguas cómo se desecha según las normas.', s: { AMB: 3, QUI: 1 } },
    ],
  },
  {
    id: 8, item: "Professor's Chalkboard", lab: 'prof', row: 155,
    context: 'Un profesor no puede trabajar: en la tarde su oficina se vuelve un horno y el aire no circula. Te pide ayuda antes de reportarlo.',
    question: '¿Qué haces primero?',
    options: [
      { t: 'Rastreas por dónde entra el sol y dibujas dónde iría una persiana o un muro.', s: { CIV: 3, AMB: 1 } },
      { t: 'Destapas el ventilador y sigues el ducto para ver por dónde no pasa el aire.', s: { MEC: 3, ELE: 1 } },
      { t: 'Comparas la temperatura con otras oficinas y propones sombra con plantas.', s: { AMB: 3, CIV: 1 } },
      { t: 'Averiguas de qué está hecho el vidrio y qué capa le bajaría el calor.', s: { QUI: 3, CIV: 1 } },
      { t: 'Mides cómo afecta el calor a quienes trabajan ahí y lo consultas con el área de salud.', s: { BIO: 3, DAT: 1 } },
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
