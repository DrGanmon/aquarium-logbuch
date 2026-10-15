import path from 'node:path';
import { JsonConfigStore } from './json-config-store';
import cryptoModule = require('../utils/crypto');
const { DUMMY_HASH, hashPassword, verifyPassword } = cryptoModule;
import envModule = require('../config/env');
const { DATA_DIR } = envModule;

export class MetricsAccessService {
  private readonly store: JsonConfigStore<{ passwordHash: string }>;

  constructor(filename = path.join(DATA_DIR, 'metrics-access.json')) {
    this.store = new JsonConfigStore(filename, () => {});
  }

  private passwordHash() {
    const hash = this.store.read().passwordHash;
    return typeof hash === 'string' ? hash : '';
  }

  isConfigured() {
    return Boolean(this.passwordHash());
  }

  async setPassword(password: string) {
    this.store.write({ passwordHash: await hashPassword(password) });
  }

  async authorize(header: string | undefined) {
    const passwordHash = this.passwordHash();
    const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
    const password = match?.[1] || '';
    const valid = await verifyPassword(password, passwordHash || DUMMY_HASH);
    return Boolean(passwordHash) && valid;
  }
}

export const metricsAccessService = new MetricsAccessService();