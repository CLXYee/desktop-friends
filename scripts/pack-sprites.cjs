// Turns generated character art (one image with several poses, or one image per pose) into a sprite
// sheet that lines up with the character's existing animations.
//
//   npm run sprites:pack -- <character> <animation> <image> [more images...] [--fps 10] [--reference-frame 0] [--row 1] [--key border|global]
//   npm run sprites:pack -- <character> --reference
//
// Runs inside Electron (for its PNG/JPEG decoder), so it needs no extra dependencies.
const { app, nativeImage } = require('electron');

if (!app) {
  // ELECTRON_RUN_AS_NODE makes Electron behave like plain Node (some editors' terminals set it).
  console.error('Run this with Electron (npm run sprites:pack ...) and with ELECTRON_RUN_AS_NODE unset.');
  process.exit(1);
}
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FRAME_W = 384;
const FRAME_H = 512;
const COLUMNS = 4;
const ROWS = 2;
const MAX_FRAMES = COLUMNS * ROWS;

// Pixel data from nativeImage is premultiplied BGRA.
const alphaAt = (bitmap, i) => bitmap[i * 4 + 3];

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  app.exit(1);
};

const parseArgs = (argv) => {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reference') options.reference = true;
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
    else positional.push(arg);
  }
  return { positional, options };
};

const loadImage = (file) => {
  const image = nativeImage.createFromPath(path.resolve(file));
  if (image.isEmpty()) throw new Error(`Could not read ${file} (PNG or JPEG expected).`);
  const { width, height } = image.getSize();
  return { width, height, bitmap: Buffer.from(image.toBitmap()) };
};

const toNativeImage = ({ width, height, bitmap }) => nativeImage.createFromBitmap(bitmap, { width, height });

// --- Background removal ------------------------------------------------------------------------

const hasTransparency = ({ width, height, bitmap }) => {
  let clear = 0;
  for (let i = 0; i < width * height; i += 7) if (alphaAt(bitmap, i) < 200) clear += 1;
  return clear / (width * height / 7) > 0.05;
};

/** The one or two dominant colors along the border (two covers fake "transparency" checkerboards). */
const borderColors = ({ width, height, bitmap }) => {
  const bins = new Map();
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    const key = (bitmap[i] >> 3) << 10 | (bitmap[i + 1] >> 3) << 5 | (bitmap[i + 2] >> 3);
    const bin = bins.get(key) ?? { count: 0, b: 0, g: 0, r: 0 };
    bin.count += 1;
    bin.b += bitmap[i];
    bin.g += bitmap[i + 1];
    bin.r += bitmap[i + 2];
    bins.set(key, bin);
  };
  for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
  const total = 2 * (width + height);
  const sorted = [...bins.values()].sort((a, b) => b.count - a.count);
  return sorted
    .filter((bin, index) => index === 0 || (index === 1 && bin.count / total > 0.15))
    .map((bin) => [bin.b / bin.count, bin.g / bin.count, bin.r / bin.count]);
};

const saturation = ([b, g, r]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

/**
 * Clears the background. A white/gray background is flood-filled from the image border only, so light
 * colors inside the character (white shirt, socks) are kept. A saturated "green screen" style background
 * is keyed out everywhere, which also clears pockets enclosed by hair or arms. Edge pixels get partial
 * alpha with the background color unmixed. Returns how many background-colored pixels were left enclosed.
 */
const removeBackground = (image, keyMode = 'auto') => {
  const { width, height, bitmap } = image;
  const colors = borderColors(image);
  const keyEverywhere = keyMode === 'global' || (keyMode === 'auto' && colors.every((color) => saturation(color) > 0.35));
  const HARD = 38;
  const SOFT = 95;
  const distanceAt = (p) => {
    const i = p * 4;
    let best = Infinity;
    for (const [b, g, r] of colors) best = Math.min(best, Math.hypot(bitmap[i] - b, bitmap[i + 1] - g, bitmap[i + 2] - r));
    return best;
  };

  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (p) => {
    if (background[p] || distanceAt(p) >= HARD) return;
    background[p] = 1;
    queue[tail++] = p;
  };
  if (keyEverywhere) {
    for (let p = 0; p < width * height; p += 1) visit(p);
  } else {
    for (let x = 0; x < width; x += 1) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y += 1) { visit(y * width); visit(y * width + width - 1); }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }

  let enclosed = 0;
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    if (!background[p] && distanceAt(p) < HARD / 2) enclosed += 1;
    if (background[p]) {
      bitmap[i] = bitmap[i + 1] = bitmap[i + 2] = bitmap[i + 3] = 0;
      continue;
    }
    const x = p % width;
    const touchesBackground = (x > 0 && background[p - 1]) || (x < width - 1 && background[p + 1])
      || (p >= width && background[p - width]) || (p < width * (height - 1) && background[p + width]);
    const distance = distanceAt(p);
    // With a key color, anything close to it (soft glows, anti-aliasing) fades out; otherwise only edges.
    if (!(keyEverywhere || touchesBackground) || distance >= SOFT) continue;
    // Fade it and remove the background's tint (result stays premultiplied).
    const alpha = Math.max(0, Math.min(1, (distance - HARD) / (SOFT - HARD)));
    const [b, g, r] = colors[0];
    bitmap[i] = Math.max(0, Math.min(255, bitmap[i] - (1 - alpha) * b));
    bitmap[i + 1] = Math.max(0, Math.min(255, bitmap[i + 1] - (1 - alpha) * g));
    bitmap[i + 2] = Math.max(0, Math.min(255, bitmap[i + 2] - (1 - alpha) * r));
    bitmap[i + 3] = Math.round(alpha * 255);
  }
  if (keyEverywhere) {
    despill(image, colors[0]);
    image.keyColor = colors[0];
  }
  return keyEverywhere ? 0 : enclosed;
};

/**
 * Removes the key color's tint (e.g. a green fringe or green showing through a soft glow): its dominant
 * channel is capped at the larger of the other two. Yellows, skin and whites keep their green.
 * Only used with a saturated key color the character doesn't wear.
 */
const despill = ({ bitmap }, keyColor) => {
  const channel = keyColor.indexOf(Math.max(...keyColor));
  const [first, second] = [0, 1, 2].filter((c) => c !== channel);
  for (let i = 0; i < bitmap.length; i += 4) {
    bitmap[i + channel] = Math.min(bitmap[i + channel], Math.max(bitmap[i + first], bitmap[i + second]));
  }
};

// --- Finding poses -------------------------------------------------------------------------------

/** Connected blobs of visible pixels, measured on a 4x-downsampled grid for speed. */
const findBlobs = (image) => {
  const { width, height, bitmap } = image;
  const STEP = 4;
  const gw = Math.ceil(width / STEP);
  const gh = Math.ceil(height / STEP);
  const solid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      let hit = false;
      for (let y = gy * STEP; y < Math.min(height, gy * STEP + STEP) && !hit; y += 1) {
        for (let x = gx * STEP; x < Math.min(width, gx * STEP + STEP); x += 1) {
          if (alphaAt(bitmap, y * width + x) > 64) { hit = true; break; }
        }
      }
      solid[gy * gw + gx] = hit ? 1 : 0;
    }
  }
  const label = new Int32Array(gw * gh).fill(-1);
  const blobs = [];
  for (let start = 0; start < gw * gh; start += 1) {
    if (!solid[start] || label[start] >= 0) continue;
    const blob = { area: 0, minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
    const stack = [start];
    label[start] = blobs.length;
    while (stack.length) {
      const p = stack.pop();
      const x = p % gw;
      const y = Math.floor(p / gw);
      blob.area += 1;
      blob.minX = Math.min(blob.minX, x);
      blob.maxX = Math.max(blob.maxX, x);
      blob.minY = Math.min(blob.minY, y);
      blob.maxY = Math.max(blob.maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const q = ny * gw + nx;
        if (solid[q] && label[q] < 0) {
          label[q] = blobs.length;
          stack.push(q);
        }
      }
    }
    blobs.push(blob);
  }
  // Kept so each pose can later be cut out by its own blobs instead of its bounding rectangle.
  image.blobGrid = { label, gw, gh, step: STEP };
  return blobs.map((blob, id) => ({
    ids: [id],
    area: blob.area,
    minX: blob.minX * STEP,
    minY: blob.minY * STEP,
    maxX: Math.min(width - 1, blob.maxX * STEP + STEP - 1),
    maxY: Math.min(height - 1, blob.maxY * STEP + STEP - 1),
  }));
};

const union = (a, b) => ({
  ids: [...(a.ids ?? []), ...(b.ids ?? [])],
  area: a.area + b.area,
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/** Tight box of visible pixels inside a region, or null if it is empty. */
const tighten = ({ width, bitmap }, box) => {
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1; let area = 0;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (alphaAt(bitmap, y * width + x) > 64) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        area += 1;
      }
    }
  }
  return maxX < 0 ? null : { area: area / 16, minX, minY, maxX, maxY };
};

/**
 * Poses whose hands or hair touch a neighbor are found as one wide blob. Split any box much wider
 * than the typical pose at its emptiest column near the middle, until widths look like single poses.
 */
const splitWidePoses = (image, poses) => {
  const { width, bitmap } = image;
  const widths = poses.map((pose) => pose.maxX - pose.minX).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)];
  const result = [];
  const queue = [...poses];
  while (queue.length) {
    const pose = queue.shift();
    const poseWidth = pose.maxX - pose.minX;
    const parts = Math.round(poseWidth / typical);
    if (parts < 2) {
      result.push(pose);
      continue;
    }
    // Look for the emptiest column around where the first pose should end.
    const target = pose.minX + poseWidth / parts;
    let bestX = -1;
    let bestCount = Infinity;
    for (let x = Math.round(target - typical * 0.3); x <= Math.round(target + typical * 0.3); x += 1) {
      if (x <= pose.minX || x >= pose.maxX) continue;
      let count = 0;
      for (let y = pose.minY; y <= pose.maxY; y += 1) if (alphaAt(bitmap, y * width + x) > 64) count += 1;
      if (count < bestCount) { bestCount = count; bestX = x; }
    }
    const left = bestX > 0 && tighten(image, { ...pose, maxX: bestX });
    const right = bestX > 0 && tighten(image, { ...pose, minX: bestX + 1 });
    if (!left || !right) {
      result.push(pose);
      continue;
    }
    // Remember which side was cut, so fragments of the neighbor left on that edge can be removed.
    result.push({ ...left, ids: pose.ids, cutRight: true, cutLeft: pose.cutLeft });
    queue.unshift({ ...right, ids: pose.ids, cutLeft: true, cutRight: pose.cutRight });
  }
  return result;
};

/**
 * Copies a pose's rectangle but keeps only pixels belonging to its own blobs (plus faint glow right
 * next to them), so a neighbor's hand or ponytail reaching into the rectangle is left out.
 */
const isolatePose = (image, box) => {
  const region = crop(image, box);
  region.keyColor = image.keyColor;
  const grid = image.blobGrid;
  if (!grid || !box.ids) return region;
  const ids = new Set(box.ids);
  const labelAt = (gx, gy) => (gx < 0 || gy < 0 || gx >= grid.gw || gy >= grid.gh ? -1 : grid.label[gy * grid.gw + gx]);
  for (let y = 0; y < region.height; y += 1) {
    const gy = Math.floor((box.minY + y) / grid.step);
    for (let x = 0; x < region.width; x += 1) {
      const gx = Math.floor((box.minX + x) / grid.step);
      const label = labelAt(gx, gy);
      let keep = ids.has(label);
      if (!keep && label < 0) {
        for (let dy = -1; dy <= 1 && !keep; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) if (ids.has(labelAt(gx + dx, gy + dy))) { keep = true; break; }
        }
      }
      if (!keep) region.bitmap.fill(0, (y * region.width + x) * 4, (y * region.width + x) * 4 + 4);
    }
  }
  return region;
};

/**
 * After a split, pieces of the neighboring pose can remain along the cut (a hand, a ponytail tip).
 * Clears connected pieces inside the box that touch a cut edge and are small next to the main body.
 */
const clearCutFragments = ({ width, bitmap }, box) => {
  if (!box.cutLeft && !box.cutRight) return;
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  const label = new Int32Array(w * h).fill(-1);
  const pieces = [];
  for (let start = 0; start < w * h; start += 1) {
    if (label[start] >= 0 || alphaAt(bitmap, (box.minY + Math.floor(start / w)) * width + box.minX + (start % w)) <= 32) continue;
    const piece = { pixels: [], touchesCut: false };
    const stack = [start];
    label[start] = pieces.length;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = Math.floor(p / w);
      piece.pixels.push(p);
      if ((box.cutLeft && x === 0) || (box.cutRight && x === w - 1)) piece.touchesCut = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] < 0 && alphaAt(bitmap, (box.minY + ny) * width + box.minX + nx) > 32) {
          label[q] = pieces.length;
          stack.push(q);
        }
      }
    }
    pieces.push(piece);
  }
  const largest = Math.max(...pieces.map((piece) => piece.pixels.length));
  for (const piece of pieces) {
    if (!piece.touchesCut || piece.pixels.length >= largest * 0.25) continue;
    for (const p of piece.pixels) {
      const i = ((box.minY + Math.floor(p / w)) * width + box.minX + (p % w)) * 4;
      bitmap[i] = bitmap[i + 1] = bitmap[i + 2] = bitmap[i + 3] = 0;
    }
  }
};

/** Groups blobs into one box per pose (stray sparkles/hair bits join the nearest pose), as rows in reading order. */
const findPoseRows = (image) => {
  const blobs = findBlobs(image);
  if (!blobs.length) return [];
  const largest = Math.max(...blobs.map((blob) => blob.area));
  let poses = blobs.filter((blob) => blob.area >= largest * 0.15);
  const extras = blobs.filter((blob) => blob.area < largest * 0.15);

  // Merge a sizeable fragment (e.g. a ponytail drawn apart) into the pose it sits on. Two full poses
  // stacked in neighboring rows have similar sizes and stay separate.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < poses.length; i += 1) {
      for (let j = i + 1; j < poses.length; j += 1) {
        const a = poses[i];
        const b = poses[j];
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const gapY = Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY);
        const isFragment = Math.min(a.area, b.area) < 0.4 * Math.max(a.area, b.area);
        if (isFragment && overlapX > 0.5 * Math.min(a.maxX - a.minX, b.maxX - b.minX) && gapY < 0.05 * image.height) {
          poses[i] = union(a, b);
          poses.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  const center = (box) => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
  for (const extra of extras) {
    const c = center(extra);
    let best = null;
    let bestDistance = Infinity;
    for (const pose of poses) {
      const dx = Math.max(pose.minX - c.x, 0, c.x - pose.maxX);
      const dy = Math.max(pose.minY - c.y, 0, c.y - pose.maxY);
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) { bestDistance = distance; best = pose; }
    }
    if (best && bestDistance < 0.15 * (best.maxY - best.minY)) Object.assign(best, union(best, extra));
  }

  poses = splitWidePoses(image, poses);
  const heights = poses.map((pose) => pose.maxY - pose.minY).sort((a, b) => a - b);
  const rowTolerance = heights[Math.floor(heights.length / 2)] * 0.5;
  poses.sort((a, b) => center(a).y - center(b).y);
  const rows = [];
  for (const pose of poses) {
    const row = rows.find((candidate) => Math.abs(center(candidate[0]).y - center(pose).y) < rowTolerance);
    if (row) row.push(pose);
    else rows.push([pose]);
  }
  return rows.map((row) => row.sort((a, b) => a.minX - b.minX));
};

// --- Measuring and placing --------------------------------------------------------------------

/** Tight box of solid pixels, and the horizontal center of the lower body (ignores waving arms). */
const measure = ({ width, bitmap }, box) => {
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (alphaAt(bitmap, y * width + x) > 128) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const bodyTop = maxY - (maxY - minY) * 0.4;
  let sum = 0;
  let count = 0;
  for (let y = Math.ceil(bodyTop); y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(bitmap, y * width + x) > 128) { sum += x; count += 1; }
    }
  }
  return { minX, minY, maxX, maxY, height: maxY - minY + 1, bodyCenterX: count ? sum / count : (minX + maxX) / 2 };
};

const crop = ({ width, bitmap }, box) => {
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    bitmap.copy(out, y * w * 4, ((box.minY + y) * width + box.minX) * 4, ((box.minY + y) * width + box.minX + w) * 4);
  }
  return { width: w, height: h, bitmap: out };
};

/** Where the character's existing art puts her: height, feet baseline and body center in a frame. */
const referenceFor = (character) => {
  const sheet = loadImage(path.join(root, 'public', 'avatars', character, 'waving.png'));
  const frame = measure(sheet, { minX: 0, minY: 0, maxX: FRAME_W - 1, maxY: FRAME_H - 1 });
  return { sheet, frame };
};

/** Matches the hand-written style: the sheet block pretty-printed, one line per animation. */
const formatAnimations = (metadata) => {
  const inline = (value) => JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  const sheet = JSON.stringify(metadata.sheet, null, 2).replace(/\n/g, '\n  ');
  const animations = Object.entries(metadata.animations).map(([name, definition]) => `    ${JSON.stringify(name)}: ${inline(definition)}`);
  return `{\n  "sheet": ${sheet},\n  "animations": {\n${animations.join(',\n')}\n  }\n}\n`;
};

// --- Commands --------------------------------------------------------------------------------

const exportReference = (character) => {
  const { sheet, frame } = referenceFor(character);
  const pad = 16;
  const box = {
    minX: Math.max(0, frame.minX - pad),
    minY: Math.max(0, frame.minY - pad),
    maxX: Math.min(FRAME_W - 1, frame.maxX + pad),
    maxY: Math.min(FRAME_H - 1, frame.maxY + pad),
  };
  const image = toNativeImage(crop(sheet, box));
  const out = path.join(root, 'art-source', character, 'reference.png');
  fs.writeFileSync(out, image.resize({ width: (box.maxX - box.minX + 1) * 2, quality: 'best' }).toPNG());
  console.log(`✔ Wrote ${path.relative(root, out)}: attach it to your image generator as the character reference.`);
};

const pack = (character, animation, files, options) => {
  const animationsPath = path.join(root, 'public', 'avatars', character, 'animations.json');
  if (!fs.existsSync(animationsPath)) return fail(`No character "${character}" in public/avatars.`);

  // 1. Collect pose crops from the input image(s).
  const poses = [];
  for (const file of files) {
    const image = loadImage(file);
    if (!hasTransparency(image)) {
      const enclosed = removeBackground(image, options.key ?? 'auto');
      if (enclosed > 2000) {
        console.warn(`! ${file}: ${enclosed} background-colored pixels sit inside the character (gaps in hair, or white clothing) and were kept.`);
        console.warn('  Best: generate with a transparent background, or a solid green (#00ff00) one, which is removed everywhere.');
      }
    }
    const rows = findPoseRows(image);
    if (options.row !== undefined && !rows[Number(options.row) - 1]) {
      return fail(`${file} has ${rows.length} row(s) of poses; --row ${options.row} doesn't exist.`);
    }
    // --row N (counting from 1) takes one row of a multi-animation sheet.
    const found = options.row !== undefined ? rows[Number(options.row) - 1] : rows.flat();
    if (!found.length) console.warn(`! No character found in ${file}; skipping it.`);
    // With one file per pose, everything in a file belongs to that pose.
    const boxes = files.length > 1 && found.length ? [found.reduce(union)] : found;
    for (const box of boxes) {
      const region = isolatePose(image, box);
      const local = { minX: 0, minY: 0, maxX: region.width - 1, maxY: region.height - 1, cutLeft: box.cutLeft, cutRight: box.cutRight };
      clearCutFragments(region, local);
      const measured = measure(region, local);
      if (measured.maxY < 0) continue;
      poses.push({ image: region, measured });
    }
  }
  if (!poses.length) return fail('No poses found. Is the character visible on a plain or transparent background?');
  if (poses.length > MAX_FRAMES) {
    console.warn(`! Found ${poses.length} poses; keeping the first ${MAX_FRAMES} (reading order).`);
    poses.length = MAX_FRAMES;
  }

  // 2. One scale for every frame, so crouches and leaps keep their size relative to each other.
  const { frame: reference } = referenceFor(character);
  const referenceIndex = options['reference-frame'] !== undefined ? Number(options['reference-frame']) : null;
  const heights = poses.map((pose) => pose.measured.height).sort((a, b) => a - b);
  const sourceHeight = referenceIndex !== null && poses[referenceIndex]
    ? poses[referenceIndex].measured.height
    : heights[Math.floor(heights.length / 2)];
  const scale = reference.height / sourceHeight;

  // 3. Place each pose with its feet on the reference baseline and its body on the reference center.
  const sheet = Buffer.alloc(FRAME_W * COLUMNS * FRAME_H * ROWS * 4);
  const sheetWidth = FRAME_W * COLUMNS;
  let clipped = 0;
  poses.forEach(({ image, measured }, index) => {
    const box = { minX: measured.minX, minY: measured.minY, maxX: measured.maxX, maxY: measured.maxY };
    const piece = toNativeImage(crop(image, box));
    const width = Math.max(1, Math.round((box.maxX - box.minX + 1) * scale));
    const height = Math.max(1, Math.round((box.maxY - box.minY + 1) * scale));
    const resized = piece.resize({ width, height, quality: 'best' });
    const pixels = resized.toBitmap();
    const size = resized.getSize();
    // High-quality resizing sharpens edges slightly: keep premultiplied values valid and re-despill.
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c += 1) pixels[i + c] = Math.min(pixels[i + c], pixels[i + 3]);
    }
    if (image.keyColor) despill({ bitmap: pixels }, image.keyColor);

    const left = Math.round(reference.bodyCenterX - (measured.bodyCenterX - box.minX) * scale);
    const top = Math.round(reference.maxY - size.height + 1);
    const originX = (index % COLUMNS) * FRAME_W;
    const originY = Math.floor(index / COLUMNS) * FRAME_H;
    let lost = false;
    for (let y = 0; y < size.height; y += 1) {
      const fy = top + y;
      if (fy < 0 || fy >= FRAME_H) { lost = true; continue; }
      for (let x = 0; x < size.width; x += 1) {
        const fx = left + x;
        const source = (y * size.width + x) * 4;
        if (fx < 0 || fx >= FRAME_W) { if (pixels[source + 3] > 0) lost = true; continue; }
        pixels.copy(sheet, ((originY + fy) * sheetWidth + originX + fx) * 4, source, source + 4);
      }
    }
    if (lost) clipped += 1;
  });

  // 4. Write the sheet, keep the source, and point the animation at the new frames.
  const outFile = path.join(root, 'public', 'avatars', character, `${animation}.png`);
  fs.writeFileSync(outFile, toNativeImage({ width: sheetWidth, height: FRAME_H * ROWS, bitmap: sheet }).toPNG());

  const sourceDir = path.join(root, 'art-source', character);
  fs.mkdirSync(sourceDir, { recursive: true });
  files.forEach((file, index) => {
    const suffix = files.length > 1 ? `-${index + 1}` : '';
    fs.copyFileSync(file, path.join(sourceDir, `${animation}-source${suffix}${path.extname(file).toLowerCase()}`));
  });

  const metadata = JSON.parse(fs.readFileSync(animationsPath, 'utf8'));
  const existing = metadata.animations[animation] ?? { fps: 8, loop: true };
  metadata.animations[animation] = {
    ...existing,
    image: `${animation}.png`,
    frames: poses.map((_, index) => index),
    ...(options.fps ? { fps: Number(options.fps) } : {}),
  };
  delete metadata.animations[animation].frameOffsetsX;
  delete metadata.animations[animation].frameOffsetsY;
  fs.writeFileSync(animationsPath, formatAnimations(metadata));

  console.log(`✔ Packed ${poses.length} frame(s) into ${path.relative(root, outFile)} (scale ×${scale.toFixed(2)}).`);
  if (poses.length !== MAX_FRAMES) console.log(`  ${animation} now plays ${poses.length} frame(s); animations.json was updated.`);
  if (clipped) console.warn(`! ${clipped} frame(s) didn't fully fit in 384×512 and were clipped. Try --reference-frame <a standing pose>.`);
  console.log(`  Original saved in ${path.relative(root, sourceDir)}. Restart the app to see it.`);
};

app.whenReady().then(() => {
  // Electron passes [electron, script, ...args] (plus "." style flags when launched via npm).
  const scriptIndex = process.argv.findIndex((arg) => arg.endsWith('pack-sprites.cjs'));
  const { positional, options } = parseArgs(process.argv.slice(scriptIndex + 1));
  const [character, animation, ...files] = positional;
  try {
    if (character && options.reference) exportReference(character);
    else if (character && animation && files.length) pack(character, animation, files, options);
    else return fail('Usage: npm run sprites:pack -- <character> <animation> <image> [more images] [--fps N] [--reference-frame N] [--row N]\n       npm run sprites:pack -- <character> --reference');
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  app.exit(0);
});
