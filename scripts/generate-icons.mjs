#!/usr/bin/env node

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sizes = [16, 32, 48, 96, 128];

const colors = {
  background: [34, 197, 94, 255],
  pause: [255, 255, 255, 255],
  transparent: [0, 0, 0, 0],
};

for (const size of sizes) {
  writeFileSync(join('public', 'icon', `${size}.png`), renderIcon(size));
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  fill(pixels, size, colors.transparent);

  const unit = size / 128;
  roundedRect(pixels, size, 18 * unit, 18 * unit, 92 * unit, 92 * unit, 22 * unit, colors.background);
  roundedRect(pixels, size, 40 * unit, 32 * unit, 18 * unit, 64 * unit, 6 * unit, colors.pause);
  roundedRect(pixels, size, 70 * unit, 32 * unit, 18 * unit, 64 * unit, 6 * unit, colors.pause);

  return encodePng(size, size, pixels);
}

function fill(pixels, size, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      setPixel(pixels, size, x, y, color);
    }
  }
}

function roundedRect(pixels, size, x, y, width, height, radius, color) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + width);
  const bottom = Math.ceil(y + height);

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const sampleX = px + 0.5;
      const sampleY = py + 0.5;
      const dx = Math.max(x + radius - sampleX, 0, sampleX - (x + width - radius));
      const dy = Math.max(y + radius - sampleY, 0, sampleY - (y + height - radius));

      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, size, px, py, color);
      }
    }
  }
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const index = (y * size + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
