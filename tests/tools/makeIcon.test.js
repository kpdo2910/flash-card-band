import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePng, drawIcon } from '../../tools/make-icon.js';

test('encodePng produces a valid PNG header, IHDR and decodable IDAT', () => {
  const size = 16;
  const png = encodePng(size, size, drawIcon(size));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, (size * 4 + 1) * size);
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
});

test('drawIcon has transparent corners and an opaque centre', () => {
  const size = 128;
  const px = drawIcon(size);
  assert.equal(px[3], 0, 'top-left corner transparent');
  const centre = ((64 * size) + 64) * 4;
  assert.equal(px[centre + 3], 255);
});
