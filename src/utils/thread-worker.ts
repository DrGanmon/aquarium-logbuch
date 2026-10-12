import type { TaskPayloads, TaskResults, TaskName, WorkerRequest, WorkerReply, Statistics } from '../types/worker';
import { asError } from './app-error';
'use strict';
import { parentPort } from 'worker_threads';
import crypto = require('crypto');
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (password: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number) => Promise<Buffer>;

const TASK_HANDLERS: { [K in TaskName]: (payload: TaskPayloads[K]) => TaskResults[K] | Promise<TaskResults[K]> } = {
  hashPassword: async ({ pw, saltHex }: TaskPayloads['hashPassword']) => {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
    const hash = await scryptAsync(pw, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  },

  verifyPassword: async ({ pw, stored }: TaskPayloads['verifyPassword']) => {
    const [saltHex, hashHex] = String(stored || '').split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const hash = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 64);
      return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
    } catch (e) {
      return false;
    }
  },

  inspectImage: ({ buffer }: TaskPayloads['inspectImage']) => {
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

  computeStats: ({ measurements, params }: TaskPayloads['computeStats']) => {
    const stats: Record<string, Statistics> = {};
    for (const p of params) {
      const values = [];
      for (const m of measurements) {
        if (m.values && m.values[p] !== undefined && m.values[p] !== null) {
          values.push(Number(m.values[p]));
        }
      }
      if (values.length > 0) {
        const sum = values.reduce((a: number, b: number) => a + b, 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = sum / values.length;
        stats[p] = { count: values.length, min, max, avg: Number(avg.toFixed(2)) };
      }
    }
    return stats;
  },
};

async function executeTask<K extends TaskName>(name: K, payload: TaskPayloads[K]): Promise<TaskResults[K]> {
  const handler = TASK_HANDLERS[name] as (value: TaskPayloads[K]) => TaskResults[K] | Promise<TaskResults[K]>;
  if (!handler) throw new Error(`Unbekannter Worker-Task: ${name}`);
  return handler(payload);
}

if (parentPort) {
  parentPort.on('message', async (msg: WorkerRequest) => {
    const { id, task, payload } = msg;
    try {
      const result = await executeTask(task, payload);
      parentPort?.postMessage({ id, success: true, result });
    } catch (caught: unknown) {
      const err = asError(caught);
      parentPort?.postMessage({ id, success: false, error: err.message || String(err) });
    }
  });
}

export = { TASK_HANDLERS, executeTask };
