#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  const crcBuf = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function createPNG(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const raw = [];
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outerR = size / 2 - 2;
  const innerR = size / 2 - size * 0.15;

  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > outerR) {
        raw.push(0, 0, 0, 0);
      } else if (dist > outerR - 3) {
        raw.push(15, 118, 57, 255);
      } else if (dist < innerR * 0.4) {
        raw.push(255, 255, 255, 60);
      } else {
        raw.push(22, 163, 74, 255);
      }
    }
  }

  const letterScale = Math.floor(size * 0.15);
  const letterX = Math.floor(cx - letterScale * 1.5);
  const letterY = Math.floor(cy - letterScale);

  function setPixel(px, py, r, g, b, a) {
    if (px < 0 || py < 0 || px >= size || py >= size) return;
    const rowStart = py * (1 + size * 4);
    const offset = rowStart + 1 + px * 4;
    raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b; raw[offset + 3] = a;
  }

  for (let dy = 0; dy <= letterScale * 2; dy++) {
    setPixel(letterX, letterY + dy, 255, 255, 255, 230);
  }
  for (let dx = 0; dx <= letterScale; dx++) {
    setPixel(letterX + dx, letterY, 255, 255, 255, 230);
    setPixel(letterX + dx, letterY + letterScale, 255, 255, 255, 230);
    if (dx < letterScale) {
      setPixel(letterX + letterScale, letterY + dx, 255, 255, 255, 230);
    }
  }

  const idat = zlib.deflateSync(Buffer.from(raw));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const png = createPNG(512);
const outPath = path.join(__dirname, 'icon.png');
fs.writeFileSync(outPath, png);
console.log('✅ 已產生圖示：' + outPath);
console.log('Windows .ico → magick icon.png icon.ico');
console.log('Mac .icns    → 在 Mac 上用 iconutil 轉換');
