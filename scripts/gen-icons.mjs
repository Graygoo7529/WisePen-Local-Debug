// 生成应用图标（纯 Node 标准库实现 PNG/ICO 编码，无需第三方依赖）。
// 用法: node scripts/gen-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(import.meta.dirname, "../src-tauri/icons");
fs.mkdirSync(outDir, { recursive: true });

// ---------- CRC32 ----------
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 生成一个 PNG Buffer。pixel(x, y) 返回 [r,g,b,a]。 */
function encodePng(size, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 图案：圆角方形渐变底 + 钢笔尖 ----------
const C1 = [99, 102, 241]; // indigo-500
const C2 = [168, 85, 247]; // purple-500

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function makePixel(size) {
  const radius = size * 0.22;
  // 钢笔尖：菱形 + 中缝（以归一化坐标描述）
  const cx = 0.5, cy = 0.52;
  const nibW = 0.30, nibH = 0.42;
  return (x, y) => {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    // 圆角矩形判定
    const px = u * size, py = v * size;
    const qx = Math.max(Math.max(radius - px, px - (size - radius)), 0);
    const qy = Math.max(Math.max(radius - py, py - (size - radius)), 0);
    if (Math.hypot(qx, qy) > radius) return [0, 0, 0, 0];
    // 渐变
    const t = (u + v) / 2;
    let r = lerp(C1[0], C2[0], t), g = lerp(C1[1], C2[1], t), b = lerp(C1[2], C2[2], t);
    // 笔尖形状（菱形）
    const dx = Math.abs(u - cx) / (nibW / 2);
    const dy = (v - (cy - nibH / 2)) / nibH;
    const inNib = dy >= 0 && dy <= 1 && dx <= 1 - Math.abs(dy - 0.35) * 1.6 && dx + dy * 0.9 <= 1.25;
    if (inNib) {
      // 中缝与圆孔留白
      const slit = Math.abs(u - cx) < 0.012 && dy > 0.42;
      const hole = Math.hypot(u - cx, v - (cy - nibH * 0.02)) < 0.035;
      if (!slit && !hole) {
        const hl = 1 - dx; // 简单高光
        r = lerp(255, 228, hl * 0.3); g = lerp(255, 228, hl * 0.3); b = lerp(255, 240, hl * 0.3);
        r = 248; g = 248; b = 252;
      }
    }
    return [r, g, b, 255];
  };
}

for (const [name, size] of [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
]) {
  fs.writeFileSync(path.join(outDir, name), encodePng(size, makePixel(size)));
}

// ICO：Vista+ 支持 PNG 内嵌
const png256 = encodePng(256, makePixel(256));
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type: icon
icoHeader.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width 256
entry[1] = 0; // height 256
entry[2] = 0; // palette
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(22, 12); // offset
fs.writeFileSync(path.join(outDir, "icon.ico"), Buffer.concat([icoHeader, entry, png256]));

console.log("icons written to", outDir);
