import { asError } from './app-error';
import { APP_ROOT } from './paths';
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
  } catch (caught: unknown) {
    const err = asError(caught);
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
  } catch (caught: unknown) {
    const err = asError(caught);
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
      const fd = fs.openSync(logPath, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        const start = Math.max(0, size - 4 * 1024 * 1024);
        const buffer = Buffer.alloc(size - start);
        const read = fs.readSync(fd, buffer, 0, buffer.length, start);
        const lines = buffer.subarray(0, read).toString('utf8').split(/\r?\n/);
        if (start > 0) lines.shift(); // Drop the first partial line.
        const count = Math.min(5000, Math.max(1, Math.trunc(Number(maxLines)) || 200));
        return lines.filter(Boolean).slice(-count);
      } finally { fs.closeSync(fd); }
    } catch (caught: unknown) {
      const err = asError(caught);
      return [`[ERROR] Konnte Log-Datei nicht lesen: ${err.message}`];
    }
  },

  /** Read a bounded window backwards; byte cursors remain stable when new logs arrive. */
  readLogPage({ limit = 200, before, level = 'all', search = '', fileId }: {
    limit?: number; before?: number; level?: string; search?: string; fileId?: string;
  } = {}) {
    const logPath = this.getLogPath();
    if (!fs.existsSync(logPath)) return { logs: [], next: null, fileId: null, reset: Boolean(before) };
    const fd = fs.openSync(logPath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const identity = `${stat.dev}:${stat.ino}`;
      const reset = before !== undefined && (before > stat.size || (fileId !== undefined && fileId !== identity));
      const end = before === undefined || reset ? stat.size : before;
      const start = Math.max(0, end - 4 * 1024 * 1024);
      const buffer = Buffer.alloc(end - start);
      const read = fs.readSync(fd, buffer, 0, buffer.length, start);
      const data = buffer.subarray(0, read);
      const boundary = start > 0 ? data.indexOf(10) + 1 : 0;
      const count = Math.min(1000, Math.max(10, Math.trunc(limit) || 200));
      const logs: string[] = [];
      let cursor = end;
      let lineEnd = data.length;
      const query = search.toLowerCase();
      for (let index = data.length - 1; index >= boundary - 1; index--) {
        if (index >= boundary && data[index] !== 10) continue;
        const lineStart = index + 1;
        const line = data.subarray(lineStart, lineEnd).toString('utf8').replace(/\r$/, '');
        cursor = start + lineStart;
        lineEnd = index;
        if (line && (level === 'all' || line.includes(`[${level}]`)) && line.toLowerCase().includes(query)) logs.unshift(line);
        if (logs.length === count) break;
      }
      // Continue into earlier file windows even when this window has no filter matches.
      if (!logs.length && start > 0) cursor = start + boundary;
      return { logs, next: cursor > 0 && cursor < end ? cursor : null, fileId: identity, reset };
    } finally { fs.closeSync(fd); }
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
    } catch (caught: unknown) {
      const err = asError(caught);
      console.error('Konnte Log-Datei nicht leeren:', err.message);
      return false;
    }
  },
};

export = logger;
