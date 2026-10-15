import { afterOfflineCommit, afterOfflineRollback } from '../db/offline-transaction';
import { asError } from '../utils/app-error';
import path = require('path');
import fs = require('fs');
import crypto = require('crypto');
import type sharpTypes from 'sharp';
const sharp: typeof sharpTypes = require('sharp');
import envModule = require('../config/env');
const { DATA_DIR } = envModule;

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_EDGE = 2048;
const MAX_IMAGE_PIXELS = 40_000_000;

function detectImageFormat(buf: Buffer | null | undefined) {
  if (!buf || buf.length < 12) return null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  // WebP: RIFF + .... + WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

async function storeImage(prefix: string, id: number | undefined, base64Data: unknown, oldFilename?: unknown, sizeError = 'Das Bild ist zu groß (maximal 5 MB erlaubt).') {
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Keine Bilddaten übermittelt.' };
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  if (!buf.length) {
    return { error: 'Ungültige Bilddaten.' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: sizeError };
  }
  const fmt = detectImageFormat(buf);
  if (!fmt) {
    return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
  }
  let output: Buffer;
  try {
    const options = { limitInputPixels: MAX_IMAGE_PIXELS, animated: true, failOn: 'error' as const };
    const image = sharp(buf, options);
    const metadata = await image.metadata();
    const expectedFormat = fmt.ext === 'jpg' ? 'jpeg' : fmt.ext;
    const totalPixels = metadata.width && metadata.pageHeight && metadata.pages
      ? metadata.width * metadata.pageHeight * metadata.pages
      : metadata.width && metadata.height ? metadata.width * metadata.height : 0;
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || totalPixels > MAX_IMAGE_PIXELS) {
      return { error: 'Ungültiges Bild oder zu hohe Auflösung (maximal 40 Megapixel).' };
    }
    const resized = image.rotate().resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true });
    switch (expectedFormat) {
      case 'jpeg': output = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(); break;
      case 'png': output = await resized.png({ compressionLevel: 9 }).toBuffer(); break;
      case 'webp': output = await resized.webp({ quality: 82 }).toBuffer(); break;
      case 'gif': output = await resized.gif().toBuffer(); break;
      default: return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
    }
  } catch {
    return { error: 'Ungültiges Bild oder zu hohe Auflösung (maximal 40 Megapixel).' };
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${prefix}_${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fmt.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), output);
  afterOfflineRollback(() => { const file = path.join(UPLOADS_DIR, filename);if (fs.existsSync(file)) fs.unlinkSync(file); });

  if (oldFilename) {
    deleteImage(oldFilename);
  }
  return { value: { filename, mime: fmt.mime } };
}

function saveImage(aquariumId?: number, base64Data?: unknown, oldFilename?: unknown) {
  return storeImage('aq', aquariumId, base64Data, oldFilename);
}

function deleteImage(filename?: unknown, strict = false) {
  if (!filename || typeof filename !== 'string') return;
  if (afterOfflineCommit(() => deleteImage(filename, strict))) return;
  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (caught: unknown) {
    const e = asError(caught);
    if (strict) throw e;
    console.error('Fehler beim Löschen der Bilddatei:', e);
  }
}

function getImagePath(filename?: unknown) {
  if (!filename || typeof filename !== 'string') return null;
  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function getMimeType(filename?: unknown) {
  if (typeof filename !== 'string' || !filename) return 'application/octet-stream';
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function saveAvatar(userId?: number, base64Data?: unknown, oldFilename?: unknown) {
  return storeImage('avatar', userId, base64Data, oldFilename, 'Das Profilbild ist zu groß (maximal 5 MB erlaubt).');
}

function saveStockImage(stockId?: number, base64Data?: unknown, oldFilename?: unknown) {
  return storeImage('stock', stockId, base64Data, oldFilename);
}

function saveAquariumImage(aquariumId?: number, base64Data?: unknown) {
  return storeImage('aq', aquariumId, base64Data);
}

export = {
  UPLOADS_DIR,
  MAX_IMAGE_BYTES,
  saveImage,
  saveAquariumImage,
  saveStockImage,
  saveAvatar,
  deleteImage,
  getImagePath,
  getMimeType,
};
