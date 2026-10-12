import path from 'node:path';
/** Runtime files live in dist/backend/src/utils; data and public stay at app root. */
export const APP_ROOT = path.resolve(__dirname, '../../../..');
