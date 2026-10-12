import { JsonConfigStore } from './json-config-store';
import { asRecord } from '../utils/validation';
import { asError } from '../utils/app-error';
'use strict';
import path = require('path');
import fs = require('fs');
import crypto = require('crypto');
import envModule = require('../config/env');
const { DATA_DIR, ALLOW_REGISTRATION } = envModule;
import logger = require('../utils/logger');

const CONFIG_FILE = path.join(DATA_DIR, 'registration-config.json');

const VALID_MODES = ['open', 'invite_admin', 'invite_open', 'closed'] as const;
type RegistrationMode = typeof VALID_MODES[number];
interface RegistrationSettings { mode: RegistrationMode; userCodeMaxDays: number; mailInviteMaxDays: number }
function isMode(value: unknown): value is RegistrationMode { return typeof value === 'string' && VALID_MODES.some(mode => mode === value); }

const DEFAULT_CONFIG: RegistrationSettings = {
  mode: ALLOW_REGISTRATION ? 'open' : 'closed',
  userCodeMaxDays: 7, // Usercodes sollen maximal 7 Tage gültig sein (vom Admin umstellbar)
  mailInviteMaxDays: 14, // Mail sind maximal 14 Tage gültig
};

class RegistrationService {
  readonly configFile: string;
  private readonly store: JsonConfigStore<RegistrationSettings>;

  constructor(configFile = CONFIG_FILE) {
    this.configFile = configFile;
    this.store = new JsonConfigStore(configFile, message => logger.error(`Fehler beim Lesen der Registrierungs-Konfiguration: ${message}`, 'registration'));
    this._ensureDirs();
  }

  _ensureDirs() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Lädt die aktuelle Registrierungskonfiguration.
   */
  getConfig() {
    this._ensureDirs();
    const fileConfig = this.store.read();

    const rawMode = fileConfig.mode || DEFAULT_CONFIG.mode;
    const mode: RegistrationMode = isMode(rawMode) ? rawMode : 'open';

    const userCodeMaxDays = Math.max(1, Math.min(365, Number(fileConfig.userCodeMaxDays) || DEFAULT_CONFIG.userCodeMaxDays));
    const mailInviteMaxDays = Math.max(1, Math.min(14, Number(fileConfig.mailInviteMaxDays) || DEFAULT_CONFIG.mailInviteMaxDays));

    return {
      mode,
      userCodeMaxDays,
      mailInviteMaxDays,
      isOpen: mode === 'open',
      isInviteAdmin: mode === 'invite_admin',
      isInviteOpen: mode === 'invite_open',
      isClosed: mode === 'closed',
      isInviteOnly: mode === 'invite_admin' || mode === 'invite_open',
      allowRegistration: mode !== 'closed',
    };
  }

  /**
   * Speichert neue Einstellungen für die Registrierung.
   */
  saveConfig(input: unknown = {}) {
    const newConfig = asRecord(input);
    this._ensureDirs();
    const current = this.getConfig();

    let targetMode = newConfig.mode !== undefined ? String(newConfig.mode).trim().toLowerCase() : current.mode;
    if (!isMode(targetMode)) {
      targetMode = current.mode;
    }

    const updated: RegistrationSettings = {
      mode: isMode(targetMode) ? targetMode : current.mode,
      userCodeMaxDays: newConfig.userCodeMaxDays !== undefined
        ? Math.max(1, Math.min(365, Number(newConfig.userCodeMaxDays) || 7))
        : current.userCodeMaxDays,
      mailInviteMaxDays: newConfig.mailInviteMaxDays !== undefined
        ? Math.max(1, Math.min(14, Number(newConfig.mailInviteMaxDays) || 14))
        : current.mailInviteMaxDays,
    };

    this.store.write(updated);
    logger.info(
      `Registrierungs-Konfiguration aktualisiert: Modus=${updated.mode}, UserCodeMaxDays=${updated.userCodeMaxDays}, MailMaxDays=${updated.mailInviteMaxDays}`,
      'registration'
    );

    return this.getConfig();
  }

  /**
   * Prüft, ob ein Benutzer (oder Gast) Berechtigung hat, Einladungen zu erstellen.
   */
  canUserInvite(user?: object | null, isAdmin: boolean = false) {
    const config = this.getConfig();
    if (config.isClosed) return false;
    if (isAdmin) return true;
    if (config.isInviteOpen && user) return true;
    return false;
  }

  /**
   * Generiert einen kryptografisch sicheren, gut lesbaren Einladungscode (z. B. AQU-9F2A-88CD).
   */
  generateInviteCode(prefix: string = 'AQU') {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${part1}-${part2}`;
  }

  /**
   * Generiert ein Einladungstoken für E-Mail-Links.
   */
  generateInviteToken() {
    return crypto.randomBytes(24).toString('hex');
  }
}

const registrationService = new RegistrationService();

export = {
  RegistrationService,
  registrationService,
  VALID_MODES,
};
