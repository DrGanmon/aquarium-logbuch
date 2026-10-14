import type sharpTypes from 'sharp';
const sharp: typeof sharpTypes = require('sharp');
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import source0 = require('./image-service');
const { UPLOADS_DIR } = source0;
import { AppError } from '../utils/app-error';
export const SOCIAL_IMAGE_MAX_EDGE = 1600;
export async function saveSocialImage(input: unknown) {
  if (typeof input !== 'string' || input.length > 14 * 1024 * 1024) throw new AppError('Bild fehlt oder ist zu groß (maximal 10 MB).', 400);
  const match = /^data:image\/(?:jpeg|png|webp|gif);base64,([a-zA-Z0-9+/=\s]+)$/.exec(input);
  if (!match) throw new AppError('Erlaubt sind JPG, PNG, WebP und GIF.', 400);
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new AppError('Bild fehlt oder ist zu groß (maximal 10 MB).', 400);
  let output;
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('Unsupported image');
    output = await image.rotate().resize(SOCIAL_IMAGE_MAX_EDGE, SOCIAL_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch { throw new AppError('Das Bild konnte nicht verarbeitet werden. Verwende ein gültiges Bild mit maximal 40 Megapixeln.', 400); }
  const filename = `social_${randomUUID()}.webp`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });await fs.writeFile(path.join(UPLOADS_DIR, filename), output.data);
  return { filename, width: output.info.width, height: output.info.height };
}
