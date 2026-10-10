'use strict';
const { fork } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

class Supervisor {
  constructor(options = {}) {
    this.targetScript = options.targetScript || path.resolve(__dirname, '../../server.js');
    this.args = options.args || process.argv.slice(2);
    this.env = options.env || {};
    this.logFile = options.logFile || this.env.LOG_FILE || null;
    this.gracefulTimeout = options.gracefulTimeout || 3000;
    this.maxCrashWindowMs = options.maxCrashWindowMs || 10000;
    this.maxCrashesInWindow = options.maxCrashesInWindow || 5;

    if (this.logFile) {
      process.env.LOG_FILE = this.logFile;
    }

    this.child = null;
    this.isRunning = false;
    this.isShuttingDown = false;
    this.restartCount = 0;
    this.crashTimestamps = [];
    this.startTime = null;

    this._boundSignals = false;
  }

  /**
   * Startet den Überwachungsprozess und den ersten Child-Prozess.
   */
  start() {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isShuttingDown = false;
    this.startTime = Date.now();

    logger.info(`Überwachungsprozess gestartet (Supervisor-PID: ${process.pid}, Ziel: ${this.targetScript})`, 'supervisor');

    this._bindProcessSignals();
    this._spawnChild();

    return this;
  }

  /**
   * Startet den Child-Prozess.
   */
  _spawnChild() {
    if (this.isShuttingDown) return;

    const childEnv = {
      ...process.env,
      ...this.env,
      IS_SUPERVISED_WORKER: '1',
    };

    const child = fork(this.targetScript, this.args, {
      env: childEnv,
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    });

    this.child = child;
    const childPid = child.pid;

    logger.info(`Anwendungsprozess gestartet (PID: ${childPid})`, 'supervisor');

    // Stdout weiterleiten und erfassen
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        process.stdout.write(text);
      });
    }

    // Stderr erfassen und als ERROR in die .log Datei loggen
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        process.stderr.write(text);
        logger.writeRaw(text, 'worker-stderr');
      });
    }

    // IPC-Nachrichten (falls vorhanden)
    child.on('message', (msg) => {
      if (msg && msg.type === 'ready') {
        logger.info(`Anwendungsprozess signalisiert Betriebsbereitschaft (PID: ${childPid})`, 'supervisor');
      }
    });

    child.on('error', (err) => {
      logger.error(`Fehler im Anwendungsprozess (PID: ${childPid}): ${err.stack || err.message}`, 'supervisor');
    });

    child.on('exit', (code, signal) => {
      this.child = null;

      if (this.isShuttingDown) {
        logger.info(`Anwendungsprozess ordnungsgemäß beendet (PID: ${childPid}, Code: ${code}, Signal: ${signal})`, 'supervisor');
        return;
      }

      // Unerwartetes Beenden / Crash
      this.restartCount++;
      const now = Date.now();
      this.crashTimestamps.push(now);
      this.crashTimestamps = this.crashTimestamps.filter((t) => now - t <= this.maxCrashWindowMs);

      logger.error(
        `Anwendungsprozess (PID: ${childPid}) wurde unerwartet beendet mit Code ${code} (Signal: ${signal || 'none'}). ` +
          `Automatischer Neustart wird eingeleitet (Gesamt-Neustarts: ${this.restartCount})...`,
        'supervisor'
      );

      // Backoff-Verzögerung bei schnellen aufeinanderfolgenden Abstürzen
      let delay = 100;
      if (this.crashTimestamps.length >= this.maxCrashesInWindow) {
        delay = 2000;
        logger.warn(
          `Häufige Abstürze erkannt (${this.crashTimestamps.length} in den letzten ${this.maxCrashWindowMs / 1000}s). ` +
            `Verzögere Neustart um ${delay}ms...`,
          'supervisor'
        );
      } else if (this.crashTimestamps.length > 2) {
        delay = 500;
      }

      setTimeout(() => {
        if (!this.isShuttingDown) {
          this._spawnChild();
        }
      }, delay);
    });
  }

  /**
   * Signal-Handler für sauberes Beenden bei SIGTERM / SIGINT.
   */
  _bindProcessSignals() {
    if (this._boundSignals) return;
    this._boundSignals = true;

    const onSignal = (sig) => {
      logger.info(`Signal ${sig} empfangen. Beende Überwachungsprozess und Anwendung geordnet...`, 'supervisor');
      this.stop().then(() => {
        process.exit(0);
      });
    };

    process.once('SIGINT', () => onSignal('SIGINT'));
    process.once('SIGTERM', () => onSignal('SIGTERM'));
  }

  /**
   * Beendet den überwachten Prozess geordnet.
   */
  async stop() {
    this.isShuttingDown = true;
    this.isRunning = false;

    if (!this.child) {
      return Promise.resolve();
    }

    const currentChild = this.child;
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          this.child = null;
          resolve();
        }
      };

      currentChild.once('exit', done);

      // Sende SIGTERM an Child
      try {
        currentChild.kill('SIGTERM');
      } catch (err) {
        // Child evtl. schon beendet
      }

      // Fallback nach Timeout: SIGKILL
      const killTimer = setTimeout(() => {
        if (!resolved) {
          logger.warn(`Child-Prozess reagiert nicht auf SIGTERM, erzwinge Beenden (SIGKILL)...`, 'supervisor');
          try {
            currentChild.kill('SIGKILL');
          } catch (e) {}
          done();
        }
      }, this.gracefulTimeout);

      if (killTimer.unref) killTimer.unref();
    });
  }

  /**
   * Startet den Child-Prozess geordnet neu.
   */
  async restart() {
    logger.info(`Manueller Neustart des Anwendungsprozesses angefordert...`, 'supervisor');
    if (this.child) {
      const oldChild = this.child;
      await new Promise((resolve) => {
        oldChild.once('exit', resolve);
        try {
          oldChild.kill('SIGTERM');
        } catch (e) {
          resolve();
        }
      });
    } else {
      this._spawnChild();
    }
  }

  /**
   * Gibt den aktuellen Status des Supervisors zurück.
   */
  getStatus() {
    return {
      running: this.isRunning,
      supervisorPid: process.pid,
      workerPid: this.child ? this.child.pid : null,
      restarts: this.restartCount,
      recentCrashes: this.crashTimestamps.length,
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }
}

module.exports = {
  Supervisor,
};
