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

// a canvas copy of a sprite sheet with the shirt painted in `hex`
function recolorSheet(img, hex) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  if (!hex) return c;
  const n = parseInt(hex.slice(1), 16), light = [n >> 16, (n >> 8) & 255, n & 255];
  const shades = [light, light.map((v) => Math.round(v * SHADOW))];
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = SHIRT.findIndex(([r, gr, b]) => d[i] === r && d[i + 1] === gr && d[i + 2] === b);
    if (k >= 0) [d[i], d[i + 1], d[i + 2]] = shades[k];
  }
  g.putImageData(id, 0, 0);
  return c;
}
