'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DATA_DIR, ALLOW_REGISTRATION } = require('../config/env');
const logger = require('../utils/logger');

const CONFIG_FILE = path.join(DATA_DIR, 'registration-config.json');

const VALID_MODES = ['open', 'invite_admin', 'invite_open', 'closed'];

const DEFAULT_CONFIG = {
  mode: ALLOW_REGISTRATION ? 'open' : 'closed',
  userCodeMaxDays: 7, // Usercodes sollen maximal 7 Tage gültig sein (vom Admin umstellbar)
  mailInviteMaxDays: 14, // Mail sind maximal 14 Tage gültig
};

class RegistrationService {
  constructor() {
    this.configFile = CONFIG_FILE;
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
    let fileConfig = {};
    if (fs.existsSync(this.configFile)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } catch (err) {
        logger.error(`Fehler beim Lesen der Registrierungs-Konfiguration: ${err.message}`, 'registration');
      }
    }

    let mode = fileConfig.mode || DEFAULT_CONFIG.mode;
    if (!VALID_MODES.includes(mode)) {
      mode = 'open';
    }

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
  saveConfig(newConfig = {}) {
    this._ensureDirs();
    const current = this.getConfig();

    let targetMode = newConfig.mode !== undefined ? String(newConfig.mode).trim().toLowerCase() : current.mode;
    if (!VALID_MODES.includes(targetMode)) {
      targetMode = current.mode;
    }

    const updated = {
      mode: targetMode,
      userCodeMaxDays: newConfig.userCodeMaxDays !== undefined
        ? Math.max(1, Math.min(365, Number(newConfig.userCodeMaxDays) || 7))
        : current.userCodeMaxDays,
      mailInviteMaxDays: newConfig.mailInviteMaxDays !== undefined
        ? Math.max(1, Math.min(14, Number(newConfig.mailInviteMaxDays) || 14))
        : current.mailInviteMaxDays,
    };

    fs.writeFileSync(this.configFile, JSON.stringify(updated, null, 2), 'utf8');
    logger.info(
      `Registrierungs-Konfiguration aktualisiert: Modus=${updated.mode}, UserCodeMaxDays=${updated.userCodeMaxDays}, MailMaxDays=${updated.mailInviteMaxDays}`,
      'registration'
    );

    return this.getConfig();
  }

  /**
   * Prüft, ob ein Benutzer (oder Gast) Berechtigung hat, Einladungen zu erstellen.
   */
  canUserInvite(user, isAdmin = false) {
    const config = this.getConfig();
    if (config.isClosed) return false;
    if (isAdmin) return true;
    if (config.isInviteOpen && user) return true;
    return false;
  }

  /**
   * Generiert einen kryptografisch sicheren, gut lesbaren Einladungscode (z. B. AQU-9F2A-88CD).
   */
  generateInviteCode(prefix = 'AQU') {
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

module.exports = {
  registrationService,
  VALID_MODES,
};
