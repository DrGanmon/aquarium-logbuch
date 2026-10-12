'use strict';
import cluster from 'node:cluster';
import path = require('path');
import os = require('os');
import logger = require('../utils/logger');

class Supervisor {
  targetScript: any;
  args: any;
  env: any;
  logFile: any;
  gracefulTimeout: any;
  maxCrashWindowMs: any;
  maxCrashesInWindow: any;
  numWorkers: any;
  children: any;
  isRunning: any;
  isShuttingDown: any;
  restartCount: any;
  crashTimestamps: any;
  startTime: any;
  _boundSignals: any;

  constructor(options: any = {}) {
    this.targetScript = options.targetScript || path.resolve(__dirname, '../../server.js');
    this.args = options.args || process.argv.slice(2);
    this.env = options.env || {};
    this.logFile = options.logFile || this.env.LOG_FILE || null;
    this.gracefulTimeout = options.gracefulTimeout || 3000;
    this.maxCrashWindowMs = options.maxCrashWindowMs || 10000;
    this.maxCrashesInWindow = options.maxCrashesInWindow || 5;

    const workersOpt = options.numWorkers || this.env.WORKERS || process.env.WORKERS || process.env.WEB_CONCURRENCY || 1;
    if (String(workersOpt).toLowerCase() === 'auto') {
      this.numWorkers = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
    } else {
      this.numWorkers = Math.max(1, Number(workersOpt) || 1);
    }

    if (this.logFile) {
      process.env.LOG_FILE = this.logFile;
    }

    this.children = new Map(); // slotIndex -> childProcess
    this.isRunning = false;
    this.isShuttingDown = false;
    this.restartCount = 0;
    this.crashTimestamps = [];
    this.startTime = null;

    this._boundSignals = false;
  }

  get child() {
    return this.children.get(0) || this.children.values().next().value || null;
  }

  set child(val: any) {
    if (!val) {
      this.children.clear();
    } else {
      this.children.set(0, val);
    }
  }

  /**
   * Startet den Überwachungsprozess und alle Worker-Prozesse.
   */
  start() {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isShuttingDown = false;
    this.startTime = Date.now();

    logger.info(
      `Überwachungsprozess gestartet (Supervisor-PID: ${process.pid}, Ziel: ${this.targetScript}, Worker-Zahl: ${this.numWorkers})`,
      'supervisor'
    );

    this._bindProcessSignals();
    for (let slot = 0; slot < this.numWorkers; slot++) {
      this._spawnWorker(slot);
    }

    return this;
  }

  /**
   * Startet einen Worker-Prozess für den angegebenen Slot.
   */
  _spawnWorker(slot: any = 0) {
    if (this.isShuttingDown) return;

    const childEnv: Record<string, any> = {
      ...process.env,
      ...this.env,
      IS_SUPERVISED_WORKER: '1',
      WORKER_ID: String(slot + 1),
      WORKERS_TOTAL: String(this.numWorkers),
    };

    // Cluster enables shared HTTP ports on Node and Bun. Plain fork() leaves
    // Bun's http.Server without SO_REUSEPORT, even when listen() requests it.
    cluster.setupPrimary({
      exec: this.targetScript,
      args: this.args,
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    });
    const child = cluster.fork(childEnv).process;

    this.children.set(slot, child);
    const childPid = child.pid;

    const prefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}/${this.numWorkers}, PID: ${childPid})` : ` (PID: ${childPid})`;
    logger.info(`Anwendungsprozess gestartet${prefix}`, 'supervisor');

    // Stdout weiterleiten und erfassen
    if (child.stdout) {
      child.stdout.on('data', (chunk: any) => {
        const text = chunk.toString();
        process.stdout.write(text);
      });
    }

    // Stderr erfassen und als ERROR in die .log Datei loggen
    if (child.stderr) {
      child.stderr.on('data', (chunk: any) => {
        const text = chunk.toString();
        process.stderr.write(text);
        const tag = this.numWorkers > 1 ? `worker-${slot + 1}-stderr` : 'worker-stderr';
        logger.writeRaw(text, tag);
      });
    }

    // IPC-Nachrichten (falls vorhanden)
    child.on('message', (msg: any) => {
      if (msg && msg.type === 'ready') {
        const readyPrefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}, PID: ${childPid})` : ` (PID: ${childPid})`;
        logger.info(`Anwendungsprozess signalisiert Betriebsbereitschaft${readyPrefix}`, 'supervisor');
      }
    });

    child.on('error', (err: any) => {
      const errPrefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}, PID: ${childPid})` : ` (PID: ${childPid})`;
      logger.error(`Fehler im Anwendungsprozess${errPrefix}: ${err.stack || err.message}`, 'supervisor');
    });

    child.on('exit', (code?: any, signal?: any) => {
      this.children.delete(slot);

      if (this.isShuttingDown) {
        const exitPrefix = this.numWorkers > 1
          ? ` (Slot: ${slot + 1}, PID: ${childPid}, Code: ${code}, Signal: ${signal})`
          : ` (PID: ${childPid}, Code: ${code}, Signal: ${signal})`;
        logger.info(`Anwendungsprozess ordnungsgemäß beendet${exitPrefix}`, 'supervisor');
        return;
      }

      // Unerwartetes Beenden / Crash
      this.restartCount++;
      const now = Date.now();
      this.crashTimestamps.push(now);
      this.crashTimestamps = this.crashTimestamps.filter((t: any) => now - t <= this.maxCrashWindowMs);

      const crashPrefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}, PID: ${childPid})` : ` (PID: ${childPid})`;
      const restartTarget = this.numWorkers > 1 ? ` für Slot ${slot + 1}` : '';
      logger.error(
        `Anwendungsprozess${crashPrefix} wurde unerwartet beendet mit Code ${code} (Signal: ${signal || 'none'}). ` +
          `Automatischer Neustart${restartTarget} wird eingeleitet (Gesamt-Neustarts: ${this.restartCount})...`,
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
          this._spawnWorker(slot);
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

    const onSignal = (sig: any) => {
      logger.info(`Signal ${sig} empfangen. Beende Überwachungsprozess und Anwendung geordnet...`, 'supervisor');
      this.stop().then(() => {
        process.exit(0);
      });
    };

    process.once('SIGINT', () => onSignal('SIGINT'));
    process.once('SIGTERM', () => onSignal('SIGTERM'));
  }

  /**
   * Beendet alle überwachten Prozesse geordnet.
   */
  async stop() {
    this.isShuttingDown = true;
    this.isRunning = false;

    if (this.children.size === 0) {
      return Promise.resolve();
    }

    const currentChildren = Array.from(this.children.values());
    this.children.clear();

    const stopPromises = currentChildren.map((child: any) => {
      return new Promise((resolve: any) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        child.once('exit', done);

        try {
          child.kill('SIGTERM');
        } catch (err) {}

        const killTimer = setTimeout(() => {
          if (!resolved) {
            logger.warn(`Child-Prozess (PID: ${child.pid}) reagiert nicht auf SIGTERM, erzwinge Beenden (SIGKILL)...`, 'supervisor');
            try {
              child.kill('SIGKILL');
            } catch (e) {}
            done();
          }
        }, this.gracefulTimeout);

        if (killTimer.unref) killTimer.unref();
      });
    });

    await Promise.allSettled(stopPromises);
  }

  /**
   * Startet alle Child-Prozesse geordnet neu.
   */
  async restart() {
    logger.info(`Manueller Neustart aller Anwendungsprozesse angefordert...`, 'supervisor');
    await this.stop();
    this.isShuttingDown = false;
    this.isRunning = true;
    for (let slot = 0; slot < this.numWorkers; slot++) {
      this._spawnWorker(slot);
    }
  }

  /**
   * Gibt den aktuellen Status des Supervisors zurück.
   */
  getStatus() {
    const workerPids = Array.from(this.children.values()).map((c: any) => c.pid);
    return {
      running: this.isRunning,
      supervisorPid: process.pid,
      workerPid: this.child ? this.child.pid : null,
      workerPids,
      totalWorkers: this.children.size,
      targetWorkers: this.numWorkers,
      restarts: this.restartCount,
      recentCrashes: this.crashTimestamps.length,
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      targetScript: this.targetScript,
    };
  }
}

export = {
  Supervisor,
};
