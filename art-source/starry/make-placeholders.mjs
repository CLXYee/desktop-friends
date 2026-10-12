// Builds PLACEHOLDER gesture sheets for Starry (walking, jumping, leaving) by tilting, squashing and
// mirroring her existing waving frames. They are not new drawings: replace each file with real art
// (see NEW-ANIMATIONS.md) whenever it is ready. Sheets that are real art are left alone unless --force.
// Usage: node art-source/starry/make-placeholders.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const avatarDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/avatars/starry');
const FRAME_W = 384;
const FRAME_H = 512;
const COLUMNS = 4;
// waving.png's second row sits 4px higher than the first; line it up so the placeholders don't bob.
const WAVING_ROW_SHIFT_Y = [0, 0, 0, 0, 4, 4, 4, 4];
// Transforms pivot around her feet.
const PIVOT = { x: 200, y: 505 };

// --- PNG decode / encode (8-bit RGBA, non-interlaced) ------------------------------------------

const decodePng = (file) => {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      if (buffer[offset + 16] !== 8 || buffer[offset + 17] !== 6) throw new Error(`${file} must be 8-bit RGBA.`);
    }
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, pixels };
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data) => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const encodePng = (width, height, pixels, comment) => {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 1; // "Sub" filter: compresses smooth artwork well.
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      raw[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - left) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from(`Comment\0${comment}`, 'latin1')),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** Matches the hand-written style: the sheet block pretty-printed, one line per animation. */
const formatAnimations = (metadata) => {
  const inline = (value) => JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  const sheet = JSON.stringify(metadata.sheet, null, 2).replace(/\n/g, '\n  ');
  const animations = Object.entries(metadata.animations).map(([name, definition]) => `    ${JSON.stringify(name)}: ${inline(definition)}`);
  return `{\n  "sheet": ${sheet},\n  "animations": {\n${animations.join(',\n')}\n  }\n}\n`;
};

// --- Frame transforms ------------------------------------------------------------------------

const waving = decodePng(path.join(avatarDir, 'waving.png'));

/** Bilinear, premultiplied sample of waving frame `index` at frame-local (x, y). */
const sample = (index, x, y, out) => {
  const originX = (index % COLUMNS) * FRAME_W;
  const originY = Math.floor(index / COLUMNS) * FRAME_H;
  const sy = y - WAVING_ROW_SHIFT_Y[index];
  const x0 = Math.floor(x);
  const y0 = Math.floor(sy);
  const fx = x - x0;
  const fy = sy - y0;
  out.fill(0);
  for (const [dx, dy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx;
    const py = y0 + dy;
    if (weight === 0 || px < 0 || py < 0 || px >= FRAME_W || py >= FRAME_H) continue;
    const i = ((originY + py) * waving.width + originX + px) * 4;
    const alpha = (waving.pixels[i + 3] / 255) * weight;
    out[0] += waving.pixels[i] * alpha;
    out[1] += waving.pixels[i + 1] * alpha;
    out[2] += waving.pixels[i + 2] * alpha;
    out[3] += alpha;
  }
};

/**
 * Draws waving frame `source` into `target` cell of `sheet`, rotated by `rotate` degrees and scaled
 * by (scaleX, scaleY) around her feet. A negative scaleX mirrors her.
 */
const drawFrame = (sheet, target, { source, rotate = 0, scaleX = 1, scaleY = 1 }) => {
  const cos = Math.cos((-rotate * Math.PI) / 180);
  const sin = Math.sin((-rotate * Math.PI) / 180);
  const originX = (target % COLUMNS) * FRAME_W;
  const originY = Math.floor(target / COLUMNS) * FRAME_H;
  const color = new Float64Array(4);
  for (let y = 0; y < FRAME_H; y += 1) {
    for (let x = 0; x < FRAME_W; x += 1) {
      // Inverse-map the output pixel back into the source frame.
      const dx = x + 0.5 - PIVOT.x;
      const dy = y + 0.5 - PIVOT.y;
      const rx = (dx * cos - dy * sin) / scaleX;
      const ry = (dx * sin + dy * cos) / scaleY;
      sample(source, PIVOT.x + rx - 0.5, PIVOT.y + ry - 0.5, color);
      const i = ((originY + y) * sheet.width + originX + x) * 4;
      const alpha = Math.min(1, color[3]);
      if (alpha <= 0) continue;
      sheet.pixels[i] = Math.round(color[0] / color[3]);
      sheet.pixels[i + 1] = Math.round(color[1] / color[3]);
      sheet.pixels[i + 2] = Math.round(color[2] / color[3]);
      sheet.pixels[i + 3] = Math.round(alpha * 255);
    }
  }
};

const placeholders = {
  // A side-to-side waddle around her feet.
  walking: [3, 5, 3, 0, -3, -5, -3, 0].map((rotate, i) => ({
    source: i,
    rotate,
    scaleY: [1, 0.98, 1, 1.01][i % 4],
  })),
  // A twirl: squeeze to edge-on, mirror, and come back around.
  jumping: [1, 0.75, 0.38, -0.75, -1, -0.75, 0.38, 0.75].map((scaleX, i) => ({
    source: i,
    scaleX,
    scaleY: 1 + (1 - Math.abs(scaleX)) * 0.04,
  })),
  // Rise from a crouch, stretch (only ~2%: the art has little headroom), a little huff, lean toward
  // the door, then back to waving.
  leaving: [
    { source: 0, scaleX: 1.05, scaleY: 0.88 },
    { source: 0, scaleX: 1.02, scaleY: 0.95 },
    { source: 0, scaleX: 0.98, scaleY: 1.015 },
    { source: 0, scaleX: 0.97, scaleY: 1.02 },
    { source: 0, scaleX: 1.03, scaleY: 0.97 },
    { source: 3, rotate: 5 },
    { source: 1, rotate: 3 },
    { source: 0 },
  ],
};

// Never overwrite real art: only replace missing sheets or earlier placeholders, unless --force.
const force = process.argv.includes('--force');
const written = [];
for (const [name, frames] of Object.entries(placeholders)) {
  const existing = path.join(avatarDir, `${name}.png`);
  if (!force && fs.existsSync(existing) && !fs.readFileSync(existing).includes('PLACEHOLDER')) {
    console.log(`kept ${name}.png: it is real art (use --force to replace it with a placeholder)`);
    continue;
  }
  written.push(name);
  const sheet = { width: FRAME_W * COLUMNS, height: FRAME_H * 2, pixels: Buffer.alloc(FRAME_W * COLUMNS * FRAME_H * 2 * 4) };
  frames.forEach((frame, index) => drawFrame(sheet, index, frame));
  const file = path.join(avatarDir, `${name}.png`);
  fs.writeFileSync(file, encodePng(sheet.width, sheet.height, sheet.pixels, `PLACEHOLDER ${name} sheet generated from waving.png by art-source/starry/make-placeholders.mjs. Replace with drawn art.`));
  console.log(`wrote ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
}

// Point the slots back at all 8 placeholder frames (a packed sheet may have used fewer).
const animationsPath = path.join(avatarDir, 'animations.json');
const metadata = JSON.parse(fs.readFileSync(animationsPath, 'utf8'));
for (const name of written) {
  if (metadata.animations[name]) metadata.animations[name].frames = [0, 1, 2, 3, 4, 5, 6, 7];
}
fs.writeFileSync(animationsPath, formatAnimations(metadata));
