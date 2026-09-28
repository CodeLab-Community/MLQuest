'use strict';

// The map's symbols, drawn by the same code on the game screen and in the phone's onboarding, so
// what a student is shown on their phone is exactly what they then find on the big screen.
// Every function takes the 2D context to draw on; sizes are in map pixels.

const MARK = '#ffd23f';   // the yellow of the markers, the star and the action button

// The action button's icon, a pointing hand: '#' is the outline, 'o' the fill, '.' transparent.
const HAND = [
  '.....##.........',
  '....#oo#........',
  '....#oo#........',
  '....#oo#........',
  '....#oo###......',
  '....#oo#oo##....',
  '....#oo#oo#o##..',
  '.##.#oo#oo#oo#..',
  '#oo##oooooooo#..',
  '#ooo#oooooooo#..',
  '.#ooooooooooo#..',
  '..#oooooooooo#..',
  '..#ooooooooo#...',
  '...#oooooooo#...',
  '....#oooooo#....',
  '....########....',
];
// the same hand at map scale, for the hint that floats over a player's head
const HAND_SMALL = [
  '...##....',
  '..#oo#...',
  '..#oo#...',
  '..#oo###.',
  '.##oo#oo#',
  '#o#ooooo#',
  '#oooooo#.',
  '.#ooooo#.',
  '..#####..',
];

function drawBitmap(ctx, rows, x, y, s = 1, fill = '#fff') {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const ch = rows[r][c];
    if (ch === '.') continue;
    ctx.fillStyle = ch === '#' ? '#000' : fill;
    ctx.fillRect(x + c * s, y + r * s, s, s);
  }
}
// a bitmap as an image URL, for <img> tags on the phone
function bitmapURL(rows, s = 1, fill = '#fff') {
  const c = document.createElement('canvas');
  c.width = rows[0].length * s; c.height = rows.length * s;
  drawBitmap(c.getContext('2d'), rows, 0, 0, s, fill);
  return c.toDataURL();
}

// "!" over every event; `by` is its bottom
function drawBang(ctx, cx, by, col = MARK) {
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 3, by - 13, 6, 13);
  ctx.fillStyle = col;
  ctx.fillRect(cx - 2, by - 12, 4, 7);
  ctx.fillRect(cx - 2, by - 3, 4, 2);
}
// the star beside Séneca, where the results are collected
function drawStar(ctx, cx, by) {
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 5, by - 12, 10, 12);
  ctx.fillStyle = MARK;
  ctx.fillRect(cx - 1, by - 11, 2, 10);
  ctx.fillRect(cx - 4, by - 7, 8, 2);
  ctx.fillRect(cx - 3, by - 9, 6, 6);
}
// The signs — floor numbers, lab titles, the map key — are text, so they are drawn smooth, not as
// pixel art: the game paints them on a canvas at the screen's own resolution, laid over the map.
// Sizes are still in map pixels; the caller scales the context.
const SIGN_FONT_FAMILY = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SIGN_FONT = `700 8px ${SIGN_FONT_FAMILY}`, SIGN_H = 10;
function plaque(ctx, x, y, w, h, fill) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 2); else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke();
}
// a floor number, as the black-and-yellow display above each lift door
function drawFloorTag(ctx, cx, top, n) {
  const s = String(n), wide = s.length > 1;
  const w = wide ? 17 : 12;
  plaque(ctx, cx - w / 2, top + 0.5, w, 10, '#111');
  ctx.fillStyle = MARK;
  ctx.font = `800 ${wide ? 7 : 8.5}px ${SIGN_FONT_FAMILY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, cx, top + 5.8);
}
// a lab's title: its name on a plaque in the lab's colour
function labSignWidth(ctx, lab) { ctx.font = SIGN_FONT; return Math.ceil(ctx.measureText(lab.name).width) + 8; }
function drawLabSign(ctx, cx, top, lab) {
  const w = labSignWidth(ctx, lab);
  plaque(ctx, cx - w / 2, top + 0.5, w, SIGN_H - 1, lab.color);
  ctx.fillStyle = '#1b140f';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(lab.name, cx, top + SIGN_H / 2 + 0.3);
}
// the action button in miniature, floated over a player who can use it right where they stand
function drawActButton(ctx, cx, cy) {
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = MARK;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  drawBitmap(ctx, HAND_SMALL, cx - 4, cy - 5);
}
