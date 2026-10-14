import { JsonConfigStore } from './json-config-store';
import { asRecord } from '../utils/validation';
interface LegalSettings { contactEmail: string | null; imprintEmail: string | null }
import {  } from '../utils/app-error';
import path = require('path');
import fs = require('fs');
import envModule = require('../config/env');
const { DATA_DIR, CONTACT_EMAIL: ENV_CONTACT_EMAIL, IMPRINT_EMAIL: ENV_IMPRINT_EMAIL } = envModule;
import logger = require('../utils/logger');

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
  readonly configFile: string;
  private readonly store: JsonConfigStore<LegalSettings>;

  constructor(configFile = CONFIG_FILE) {
    this.configFile = configFile;
    this.store = new JsonConfigStore(configFile, message => logger.error(`Fehler beim Lesen der Legal-Konfiguration: ${message}`, 'legal'));
    this._ensureDirs();
  }

  _ensureDirs() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    } catch {
      // ignore
    }
  }

  /**
   * Gibt die aktuelle Konfiguration für Impressum, Kontakt und Lizenz zurück.
   */
  getConfig() {
    this._ensureDirs();
    const fileConfig = this.store.read();
    const configuredContact = typeof fileConfig.contactEmail === 'string' ? fileConfig.contactEmail : '';
    const configuredImprint = typeof fileConfig.imprintEmail === 'string' ? fileConfig.imprintEmail : '';

    const contactEmail = (configuredContact || ENV_CONTACT_EMAIL || 'dr@ganmon.org').trim();
    const imprintEmail = (configuredImprint || ENV_IMPRINT_EMAIL || contactEmail || 'dr@ganmon.org').trim();

    return {
      contactEmail,
      imprintEmail,
      license: APP_LICENSE,
      hasCustomConfig: !!(configuredContact || configuredImprint),
    };
  }

  /**
   * Speichert neue Einstellungen für Impressums- und Kontakt-E-Mails.
   */
  saveConfig(input: unknown = {}) {
    const newConfig = asRecord(input);
    this._ensureDirs();

    const contactEmail = newConfig.contactEmail !== undefined
      ? (newConfig.contactEmail ? String(newConfig.contactEmail).trim() : null)
      : undefined;
    const imprintEmail = newConfig.imprintEmail !== undefined
      ? (newConfig.imprintEmail ? String(newConfig.imprintEmail).trim() : null)
      : undefined;

    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new Error('Ungültige Kontakt-E-Mail-Adresse.');
    }
    if (imprintEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(imprintEmail)) {
      throw new Error('Ungültige Impressums-E-Mail-Adresse.');
    }

    const current = this.getConfig();
    const toSave: LegalSettings = {
      contactEmail: contactEmail !== undefined ? contactEmail : (current.hasCustomConfig ? current.contactEmail : null),
      imprintEmail: imprintEmail !== undefined ? imprintEmail : (current.hasCustomConfig ? current.imprintEmail : null),
    };

    this.store.write(toSave);
    logger.info(
      `Rechtliche Konfiguration aktualisiert: Kontakt=${toSave.contactEmail}, Impressum=${toSave.imprintEmail}`,
      'legal'
    );

    return this.getConfig();
  }
}

const legalConfigService = new LegalConfigService();

export = {
  LegalConfigService,
  legalConfigService,
  APP_LICENSE,
};
