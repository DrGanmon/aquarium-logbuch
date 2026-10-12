import { APP_ROOT } from './paths';
'use strict';
import fs = require('fs');
import path = require('path');

function getDataDir() {
  return process.env.DATA_DIR || path.join(APP_ROOT, 'data');
}

function getLogPath() {
  return process.env.LOG_FILE || path.join(getDataDir(), 'aquarium.log');
}

/**
 * Stellt sicher, dass das Verzeichnis für die Log-Datei existiert.
 */
function ensureLogDir(filePath?: any) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // Falls Fehler beim Erstellen auftreten, auf Konsole ausgeben
    console.error('Konnte Log-Verzeichnis nicht erstellen:', err.message);
  }
}

/**
 * Formatiert den aktuellen Zeitstempel als YYYY-MM-DD HH:mm:ss.SSS.
 */
function formatTimestamp(date: any = new Date()) {
  const pad = (n?: any, len: any = 2) => String(n).padStart(len, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
}

/**
 * Schreibt eine formatierte Zeile in die Log-Datei.
 */
function writeToFile(line?: any, filePath: any = getLogPath()) {
  try {
    ensureLogDir(filePath);
    fs.appendFileSync(filePath, line + '\n', 'utf8');
  } catch (err) {
    console.error('Fehler beim Schreiben in Log-Datei:', err.message);
  }
}

/**
 * Formatiert Nachrichten oder Error-Objekte.
 */
function formatMessage(msg?: any) {
  if (msg instanceof Error) {
    return msg.stack || `${msg.name}: ${msg.message}`;
  }
  if (typeof msg === 'object' && msg !== null) {
    try {
      return JSON.stringify(msg);
    } catch {
      return String(msg);
    }
  }
  return String(msg);
}

/**
 * Haupt-Logger-Objekt.
 */
const logger: Record<string, any> = {
  getLogPath() {
    return getLogPath();
  },

  log(level?: any, message?: any, tag: any = 'app') {
    const ts = formatTimestamp();
    const lvl = String(level).toUpperCase();
    const formatted = formatMessage(message);
    const line = `[${ts}] [${lvl}] [${tag}] ${formatted}`;

    writeToFile(line, this.getLogPath());

    // In Nicht-Test-Umgebungen auch auf der Konsole ausgeben
    if (process.env.NODE_ENV !== 'test' && process.env.CONSOLE_LOG !== 'false') {
      if (lvl === 'ERROR' || lvl === 'FATAL') {
        console.error(line);
      } else if (lvl === 'WARN') {
        console.warn(line);
      } else {
        console.log(line);
      }
    }

    return line;
  },

  info(message?: any, tag: any = 'app') {
    return this.log('INFO', message, tag);
  },

  warn(message?: any, tag: any = 'app') {
    return this.log('WARN', message, tag);
  },

  error(message?: any, tag: any = 'app') {
    return this.log('ERROR', message, tag);
  },

  fatal(message?: any, tag: any = 'app') {
    return this.log('FATAL', message, tag);
  },

  writeRaw(text?: any, tag: any = 'worker') {
    if (!text) return;
    const lines = String(text).split(/\r?\n/).filter(Boolean);
    for (const l of lines) {
      const isErr = /error|exception|fail|uncaught|fatal/i.test(l);
      this.log(isErr ? 'ERROR' : 'INFO', l, tag);
    }
  },

  /**
   * Liest die letzten Zeilen der Log-Datei.
   */
  readRecentLogs(maxLines: any = 200) {
    const logPath = this.getLogPath();
    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split(/\r?\n/).filter(Boolean);
      return lines.slice(-maxLines);
    } catch (err) {
      return [`[ERROR] Konnte Log-Datei nicht lesen: ${err.message}`];
    }
  },

  /**
   * Leert die Log-Datei.
   */
  clearLogs() {
    const logPath = this.getLogPath();
    try {
      ensureLogDir(logPath);
      fs.writeFileSync(logPath, '', 'utf8');
      this.info('Log-Datei wurde bereinigt.', 'system');
      return true;
    } catch (err) {
      console.error('Konnte Log-Datei nicht leeren:', err.message);
      return false;
    }
  },
};

export = logger;
