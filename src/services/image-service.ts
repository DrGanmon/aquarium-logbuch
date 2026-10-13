import { asError } from '../utils/app-error';
'use strict';
import path = require('path');
import fs = require('fs');
import crypto = require('crypto');
import envModule = require('../config/env');
const { DATA_DIR } = envModule;

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

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

function saveImage(aquariumId?: number, base64Data?: unknown, oldFilename?: unknown) {
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Keine Bilddaten übermittelt.' };
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  if (!buf.length) {
    return { error: 'Ungültige Bilddaten.' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: 'Das Bild ist zu groß (maximal 5 MB erlaubt).' };
  }
  const fmt = detectImageFormat(buf);
  if (!fmt) {
    return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `aq_${aquariumId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fmt.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  if (oldFilename) {
    deleteImage(oldFilename);
  }
  return { value: { filename, mime: fmt.mime } };
}

function deleteImage(filename?: unknown, strict = false) {
  if (!filename || typeof filename !== 'string') return;
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
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Keine Bilddaten übermittelt.' };
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  if (!buf.length) {
    return { error: 'Ungültige Bilddaten.' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: 'Das Profilbild ist zu groß (maximal 5 MB erlaubt).' };
  }
  const fmt = detectImageFormat(buf);
  if (!fmt) {
    return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `avatar_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fmt.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  if (oldFilename) {
    deleteImage(oldFilename);
  }
  return { value: { filename, mime: fmt.mime } };
}

function saveStockImage(stockId?: number, base64Data?: unknown, oldFilename?: unknown) {
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Keine Bilddaten übermittelt.' };
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  if (!buf.length) {
    return { error: 'Ungültige Bilddaten.' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: 'Das Bild ist zu groß (maximal 5 MB erlaubt).' };
  }
  const fmt = detectImageFormat(buf);
  if (!fmt) {
    return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `stock_${stockId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fmt.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  if (oldFilename) {
    deleteImage(oldFilename);
  }
  return { value: { filename, mime: fmt.mime } };
}

function saveAquariumImage(aquariumId?: number, base64Data?: unknown) {
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Keine Bilddaten übermittelt.' };
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  if (!buf.length) {
    return { error: 'Ungültige Bilddaten.' };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { error: 'Das Bild ist zu groß (maximal 5 MB erlaubt).' };
  }
  const fmt = detectImageFormat(buf);
  if (!fmt) {
    return { error: 'Ungültiges Bildformat. Erlaubt sind JPG, PNG, WebP und GIF.' };
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `aq_${aquariumId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fmt.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  return { value: { filename, mime: fmt.mime } };
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
