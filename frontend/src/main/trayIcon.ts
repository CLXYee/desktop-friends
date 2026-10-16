import { app, nativeImage, type NativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const avatarsDirectory = (): string => (
  app.isPackaged
    ? path.join(process.resourcesPath, 'avatars')
    : path.join(app.getAppPath(), 'public', 'avatars')
);

// Crops a square around the head of the first waving frame so the icon reads at 16px.
const loadCharacterPortrait = (characterId: string): NativeImage | null => {
  try {
    const characterDirectory = path.join(avatarsDirectory(), characterId);
    const metadata = JSON.parse(fs.readFileSync(path.join(characterDirectory, 'animations.json'), 'utf8')) as {
      sheet: { frameWidth: number; frameHeight: number };
      animations: { waving?: { image: string; frames: number[] } };
    };
    const waving = metadata.animations.waving;
    if (!waving) return null;

    const sheet = nativeImage.createFromPath(path.join(characterDirectory, waving.image));
    if (sheet.isEmpty()) return null;

    const { frameWidth, frameHeight } = metadata.sheet;
    const frame = sheet.crop({ x: 0, y: 0, width: frameWidth, height: frameHeight });
    const { width, height } = frame.getSize();
    const bitmap = frame.toBitmap();

    let minX = width;
    let minY = height;
    let maxX = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (bitmap[(y * width + x) * 4 + 3] > 32) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
        }
      }
    }
    if (maxX < 0) return null;

    const side = Math.min(maxX - minX + 1, height - minY);
    const left = Math.max(0, Math.min(width - side, Math.round((minX + maxX - side) / 2)));
    return frame.crop({ x: left, y: minY, width: side, height: side });
  } catch {
    return null;
  }
};

// A plain brand-green dot for characters that do not have artwork yet.
const createFallbackIcon = (size: number): NativeImage => {
  const buffer = Buffer.alloc(size * size * 4);
  const radius = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
      const alpha = Math.max(0, Math.min(1, radius - distance)) * 255;
      const offset = (y * size + x) * 4;
      buffer[offset] = 0x45;
      buffer[offset + 1] = 0x5d;
      buffer[offset + 2] = 0x38;
      buffer[offset + 3] = Math.round(alpha);
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
};

const withSizes = (source: NativeImage, sizes: { scaleFactor: number; size: number }[]): NativeImage => {
  const image = nativeImage.createEmpty();
  for (const { scaleFactor, size } of sizes) {
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    });
  }
  return image;
};

export const createTrayIcon = (characterId: string): NativeImage => {
  const portrait = loadCharacterPortrait(characterId) ?? loadCharacterPortrait('crystal') ?? createFallbackIcon(64);
  return withSizes(portrait, [
    { scaleFactor: 1, size: 16 },
    { scaleFactor: 1.5, size: 24 },
    { scaleFactor: 2, size: 32 },
  ]);
};

export const createWindowIcon = (characterId: string): NativeImage => {
  const portrait = loadCharacterPortrait(characterId) ?? loadCharacterPortrait('crystal') ?? createFallbackIcon(256);
  return portrait.resize({ width: 256, height: 256, quality: 'best' });
};
