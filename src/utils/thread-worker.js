'use strict';
const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

const TASK_HANDLERS = {
  hashPassword: async ({ pw, saltHex }) => {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
    const hash = await scryptAsync(pw, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  },

  verifyPassword: async ({ pw, stored }) => {
    const [saltHex, hashHex] = String(stored || '').split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const hash = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 64);
      return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
    } catch (e) {
      return false;
    }
  },

  inspectImage: ({ buffer }) => {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (!buf || buf.length < 12) return null;

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { ext: 'jpg', mime: 'image/jpeg', size: buf.length };
    }
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { ext: 'png', mime: 'image/png', size: buf.length };
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { ext: 'gif', mime: 'image/gif', size: buf.length };
    }
    if (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { ext: 'webp', mime: 'image/webp', size: buf.length };
    }
    return null;
  },

  computeStats: ({ measurements, params }) => {
    const stats = {};
    for (const p of params) {
      const values = [];
      for (const m of measurements) {
        if (m.values && m.values[p] !== undefined && m.values[p] !== null) {
          values.push(Number(m.values[p]));
        }
      }
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = sum / values.length;
        stats[p] = { count: values.length, min, max, avg: Number(avg.toFixed(2)) };
      }
    }
    return stats;
  },
};

if (parentPort) {
  parentPort.on('message', async (msg) => {
    const { id, task, payload } = msg;
    try {
      const handler = TASK_HANDLERS[task];
      if (!handler) {
        throw new Error(`Unbekannter Worker-Task: ${task}`);
      }
      const result = await handler(payload);
      parentPort.postMessage({ id, success: true, result });
    } catch (err) {
      parentPort.postMessage({ id, success: false, error: err.message || String(err) });
    }
  });
}

module.exports = { TASK_HANDLERS };
