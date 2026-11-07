#!/usr/bin/env node
/**
 * Draws the launcher icon (two stacked flashcards with a red "sun" dot) as a
 * 128x128 RGBA PNG using only Node built-ins. Output: src/presentation/images/icon.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function inRoundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

export function drawIcon(size = SIZE) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 128;
  const put = (x, y, r, g, b, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // background: dark rounded square
      if (inRoundedRect(x, y, 0, 0, size, size, 28 * s)) put(x, y, 18, 18, 22);
      else put(x, y, 0, 0, 0, 0);
      // back card (grey, rotated look approximated by offset)
      if (inRoundedRect(x, y, 34 * s, 22 * s, 70 * s, 84 * s, 10 * s)) put(x, y, 110, 110, 120);
      // front card (white)
      if (inRoundedRect(x, y, 22 * s, 32 * s, 70 * s, 84 * s, 10 * s)) put(x, y, 245, 245, 245);
      // red dot (hinomaru) on the front card
      const dx = x - 57 * s, dy = y - 74 * s;
      if (dx * dx + dy * dy <= (18 * s) ** 2) put(x, y, 220, 38, 48);
    }
  }
  return px;
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/presentation/images/icon.png');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodePng(SIZE, SIZE, drawIcon(SIZE)));
  console.log('✔ icon → ' + OUT);
}
