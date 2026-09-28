'use strict';
// Every player's colour: the shirt on their sprite and the tag over their head, on the big screen and
// on their phone alike. The first phone (slot 1) takes the first colour; the keyboard player (slot 0)
// the last. None of them is the sprite sheets' own red, so every player is coloured.
const PLAYER_COLORS = [
  '#3d7eea', '#2fa84f', '#f07f1d', '#8e4fd6', '#e0a800', '#1fb3c8',
  '#f0509a', '#9a5b32', '#7cc62e', '#2b3fa0', '#14907e', '#6b7280',
];
const colorFor = (slot) => PLAYER_COLORS[(slot + PLAYER_COLORS.length - 1) % PLAYER_COLORS.length];

// the shirt's two shades as drawn in the sprite sheets: light, and its shadow
const SHIRT = [[228, 59, 68], [160, 46, 58]];
const SHADOW = 0.7;   // the shadow is the new colour at this brightness

// The skin and hair each player picks on their phone. Entry 0 is how the sprite sheets are drawn;
// each entry lists the same shades in the same order (skin: light, shadow; hair: light, mid, dark).
const SKINS = [
  { name: 'Clara', shades: [[232, 183, 150], [163, 129, 113]] },
  { name: 'Media', shades: [[198, 138, 94], [140, 94, 66]] },
  { name: 'Oscura', shades: [[124, 80, 54], [86, 54, 40]] },
];
const HAIRS = [
  { name: 'Castaño', shades: [[216, 118, 68], [116, 63, 57], [63, 40, 50]] },
  { name: 'Negro', shades: [[96, 92, 118], [52, 48, 68], [30, 26, 40]] },
  { name: 'Rubio', shades: [[250, 214, 112], [208, 152, 62], [140, 96, 42]] },
];
const rgbCss = ([r, g, b]) => `rgb(${r},${g},${b})`;

// a canvas copy of a sprite sheet (16px frames) with the shirt in `look.shirt` (a #hex colour) and
// the skin and hair of `look.skin` / `look.hair` (indexes into SKINS / HAIRS)
function recolorSheet(img, { shirt, skin = 0, hair = 0 } = {}) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const swaps = [];   // [from, to, hair only]
  if (shirt) {
    const n = parseInt(shirt.slice(1), 16), light = [n >> 16, (n >> 8) & 255, n & 255];
    swaps.push([SHIRT[0], light], [SHIRT[1], light.map((v) => Math.round(v * SHADOW))]);
  }
  SKINS[skin].shades.forEach((to, k) => swaps.push([SKINS[0].shades[k], to]));
  HAIRS[hair].shades.forEach((to, k) => swaps.push([HAIRS[0].shades[k], to, true]));
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data, W = c.width;
  const at = (x, y) => (y * W + x) * 4;
  const is = (i, [r, gr, b]) => d[i + 3] && d[i] === r && d[i + 1] === gr && d[i + 2] === b;
  for (let f = 0; f * 16 < W; f++) {
    // the hair's mid shade is also the shoes: only the head, above the shirt, is hair
    let neck = 16;
    for (let y = 0; y < 16 && neck === 16; y++) for (let x = f * 16; x < f * 16 + 16; x++) if (SHIRT.some((s) => is(at(x, y), s))) { neck = y; break; }
    for (let y = 0; y < c.height; y++) for (let x = f * 16; x < f * 16 + 16; x++) {
      const i = at(x, y);
      const s = swaps.find(([from, , hairOnly]) => (!hairOnly || y < neck) && is(i, from));
      if (s) [d[i], d[i + 1], d[i + 2]] = s[1];
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}
