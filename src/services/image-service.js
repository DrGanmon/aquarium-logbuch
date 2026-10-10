'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DATA_DIR } = require('../config/env');

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function detectImageFormat(buf) {
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

function saveImage(aquariumId, base64Data, oldFilename) {
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

function deleteImage(filename) {
  if (!filename || typeof filename !== 'string') return;
  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (e) {
    console.error('Fehler beim Löschen der Bilddatei:', e);
  }
}

function getImagePath(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function getMimeType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

module.exports = {
  UPLOADS_DIR,
  MAX_IMAGE_BYTES,
  saveImage,
  deleteImage,
  getImagePath,
  getMimeType,
};
