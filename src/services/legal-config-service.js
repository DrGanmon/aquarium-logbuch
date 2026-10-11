'use strict';
const path = require('path');
const fs = require('fs');
const { DATA_DIR, CONTACT_EMAIL: ENV_CONTACT_EMAIL, IMPRINT_EMAIL: ENV_IMPRINT_EMAIL } = require('../config/env');
const logger = require('../utils/logger');

const CONFIG_FILE = path.join(DATA_DIR, 'legal-config.json');

const APP_LICENSE = {
  identifier: 'CC-BY-NC-SA-4.0',
  name: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)',
  summary: 'Lizenz für private Nutzung und Weiterentwicklung. Erlaubt die private, persönliche Nutzung und Modifikation. Modifikationen und Weiterentwicklungen müssen unter derselben Lizenz (Copyleft / ShareAlike) und mit Urhebernennung veröffentlicht werden. Jegliche kommerzielle Nutzung ist vollständig untersagt.',
  privateUseAllowed: true,
  modificationAllowed: true,
  shareAlikeRequired: true,
  attributionRequired: true,
  commercialUseAllowed: false,
};

class LegalConfigService {
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
   * Gibt die aktuelle Konfiguration für Impressum, Kontakt und Lizenz zurück.
   */
  getConfig() {
    this._ensureDirs();
    let fileConfig = {};
    if (fs.existsSync(this.configFile)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } catch (err) {
        logger.error(`Fehler beim Lesen der Legal-Konfiguration: ${err.message}`, 'legal');
      }
    }

    const contactEmail = (fileConfig.contactEmail || ENV_CONTACT_EMAIL || 'dr@ganmon.org').trim();
    const imprintEmail = (fileConfig.imprintEmail || ENV_IMPRINT_EMAIL || contactEmail || 'dr@ganmon.org').trim();

    return {
      contactEmail,
      imprintEmail,
      license: APP_LICENSE,
      hasCustomConfig: !!(fileConfig.contactEmail || fileConfig.imprintEmail),
    };
  }

  /**
   * Speichert neue Einstellungen für Impressums- und Kontakt-E-Mails.
   */
  saveConfig(newConfig = {}) {
    this._ensureDirs();

    let contactEmail = newConfig.contactEmail !== undefined
      ? (newConfig.contactEmail ? String(newConfig.contactEmail).trim() : null)
      : undefined;
    let imprintEmail = newConfig.imprintEmail !== undefined
      ? (newConfig.imprintEmail ? String(newConfig.imprintEmail).trim() : null)
      : undefined;

    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new Error('Ungültige Kontakt-E-Mail-Adresse.');
    }
    if (imprintEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(imprintEmail)) {
      throw new Error('Ungültige Impressums-E-Mail-Adresse.');
    }

    const current = this.getConfig();
    const toSave = {
      contactEmail: contactEmail !== undefined ? contactEmail : (current.hasCustomConfig ? current.contactEmail : null),
      imprintEmail: imprintEmail !== undefined ? imprintEmail : (current.hasCustomConfig ? current.imprintEmail : null),
    };

    fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
    logger.info(
      `Rechtliche Konfiguration aktualisiert: Kontakt=${toSave.contactEmail}, Impressum=${toSave.imprintEmail}`,
      'legal'
    );

    return this.getConfig();
  }
}

const legalConfigService = new LegalConfigService();

module.exports = {
  legalConfigService,
  APP_LICENSE,
};
