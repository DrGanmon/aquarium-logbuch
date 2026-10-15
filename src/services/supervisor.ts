import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { asRecord } from '../utils/validation';
import { loadControllerSecret } from './rate-limit-controller';
interface SupervisorOptions { targetScript?: string; controllerScript?: string; args?: string[]; env?: NodeJS.ProcessEnv; logFile?: string; gracefulTimeout?: number; maxCrashWindowMs?: number; maxCrashesInWindow?: number; numWorkers?: number | 'auto' }
import cluster from 'node:cluster';
import path = require('path');
import os = require('os');
import logger = require('../utils/logger');

class Supervisor {
  targetScript: string;
  controllerScript: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  logFile: string | null;
  gracefulTimeout: number;
  maxCrashWindowMs: number;
  maxCrashesInWindow: number;
  numWorkers: number;
  children: Map<number, ChildProcess>;
  rateLimitController: ChildProcess | null;
  controllerRestartCount: number;
  readonly events = new EventEmitter();
  isRunning: boolean;
  isShuttingDown: boolean;
  restartCount: number;
  crashTimestamps: number[];
  startTime: number | null;
  _boundSignals: boolean;
  private restartTimers = new Set<ReturnType<typeof setTimeout>>();
  private controllerRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private controllerReady = false;
  private controllerRequestCounter = 0;
  private controllerRequests = new Map<string, { child: ChildProcess; workerRequestId: string; timer: ReturnType<typeof setTimeout> }>();
  private controllerCrashStreak = 0;
  private readonly controllerSecret: string;
  private generation = 0;
  private stopPromise: Promise<void> | null = null;
  private restartPromise: Promise<void> | null = null;
  private readonly onSigint = () => this.handleSignal('SIGINT');
  private readonly onSigterm = () => this.handleSignal('SIGTERM');

  constructor(options: SupervisorOptions = {}) {
    this.targetScript = options.targetScript || path.resolve(__dirname, '../../server.js');
    this.controllerScript = options.controllerScript || path.resolve(__dirname, 'rate-limit-controller.js');
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
      this.numWorkers = Math.min(64, Math.max(1, Math.trunc(Number(workersOpt)) || 1));
    }

    if (this.logFile) {
      process.env.LOG_FILE = this.logFile;
    }

    this.children = new Map(); // slotIndex -> childProcess
    this.rateLimitController = null;
    this.controllerRestartCount = 0;
    this.controllerSecret = this.env.RATE_LIMIT_CONTROLLER_SECRET || loadControllerSecret(this.env.DATA_DIR);
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

  set child(val: ChildProcess | null) {
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
    this._spawnRateLimitController();
    for (let slot = 0; slot < this.numWorkers; slot++) {
      this._spawnWorker(slot);
    }

    return this;
  }

  private _spawnRateLimitController() {
    if (this.isShuttingDown || !this.isRunning || this.rateLimitController) return;
    const controller = spawn(process.execPath, [this.controllerScript], {
      env: {
        DATA_DIR: this.env.DATA_DIR || process.env.DATA_DIR,
        NODE_ENV: this.env.NODE_ENV || process.env.NODE_ENV,
        RATE_LIMIT_CONTROLLER_SECRET: this.controllerSecret,
        IS_RATE_LIMIT_CONTROLLER: '1',
        RATE_LIMIT_CONTROLLER_PIPE: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.rateLimitController = controller;
    this.controllerReady = false;
    logger.info(`Rate-Limit-Controller gestartet (PID: ${controller.pid})`, 'supervisor');
    let controllerOutput = '';
    controller.stdout?.setEncoding('utf8');
    controller.stdout?.on('data', (chunk: string) => {
      controllerOutput += chunk;
      if (controllerOutput.length > 1024 * 1024) { controller.kill('SIGKILL');return; }
      let newline;
      while ((newline = controllerOutput.indexOf('\n')) >= 0) {
        const line = controllerOutput.slice(0, newline);controllerOutput = controllerOutput.slice(newline + 1);
        if (!line || line.length > 4096) continue;
        try { this._handleControllerMessage(controller, JSON.parse(line)); }
        catch { logger.warn('Ungültige Nachricht des Rate-Limit-Controllers verworfen.', 'supervisor'); }
      }
    });
    controller.stderr?.on('data', (chunk: Buffer) => { process.stderr.write(chunk);logger.writeRaw(chunk.toString(), 'rate-limit-controller-stderr'); });
    controller.stdin?.on('error', (error: NodeJS.ErrnoException) => {
      if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code || '')) logger.error(`Schreibfehler zum Rate-Limit-Controller: ${error.message}`, 'supervisor');
    });
    const generation = this.generation;
    let failureHandled = false;
    const restartController = (reason: string) => {
      if (failureHandled) return;
      failureHandled = true;
      if (this.rateLimitController === controller) this.rateLimitController = null;
      this.controllerReady = false;
      this._failControllerRequests('controller-restarting');
      if (this.isShuttingDown || !this.isRunning || generation !== this.generation) return;
      this.controllerRestartCount++;
      this.controllerCrashStreak++;
      const delay = Math.min(2000, 100 * 2 ** Math.min(this.controllerCrashStreak - 1, 4));
      logger.error(`Rate-Limit-Controller ${reason}. Neustart in ${delay}ms; Web-Worker laufen weiter.`, 'supervisor');
      this.controllerRestartTimer = setTimeout(() => {
        this.controllerRestartTimer = null;
        if (!this.isShuttingDown && this.isRunning && generation === this.generation) this._spawnRateLimitController();
      }, delay);
      this.controllerRestartTimer.unref?.();
    };
    controller.on('error', (error: Error) => {
      logger.error(`Fehler im Rate-Limit-Controller: ${error.stack || error.message}`, 'supervisor');
      restartController(`Fehler (${error.message})`);
    });
    controller.once('exit', (code, signal) => restartController(`unerwartet beendet (Code: ${code}, Signal: ${signal || 'none'})`));
  }

  private _handleControllerMessage(controller: ChildProcess, message: unknown) {
    if (controller !== this.rateLimitController) return;
    const msg = asRecord(message);
    if (msg.type === 'rate-limit:controller-ready') {
      this.controllerReady = true;
      this.controllerCrashStreak = 0;
      logger.info(`Rate-Limit-Controller betriebsbereit (PID: ${controller.pid})`, 'supervisor');
      return;
    }
    if (msg.type !== 'rate-limit:controller-response' || typeof msg.requestId !== 'string') return;
    const route = this.controllerRequests.get(msg.requestId);
    if (!route) return;
    this.controllerRequests.delete(msg.requestId);
    clearTimeout(route.timer);
    if (route.child.connected) route.child.send({ type: 'rate-limit:response', requestId: route.workerRequestId,
      blocked: typeof msg.blocked === 'boolean' ? msg.blocked : undefined, ok: msg.ok === true, error: typeof msg.error === 'string' ? msg.error : undefined });
  }

  private _handleRateLimitRequest(child: ChildProcess, message: Record<string, unknown>): boolean {
    if (message.type !== 'rate-limit:request') return false;
    const requestId = message.requestId;
    const operation = message.operation;
    const key = message.key;
    const limit = message.limit;
    const valid = typeof requestId === 'string' && requestId.length >= 1 && requestId.length <= 160
      && (operation === 'check-and-note' || operation === 'clear')
      && typeof key === 'string' && key.length >= 1 && key.length <= 1024 && !key.includes('\0')
      && (operation === 'clear' || (Number.isSafeInteger(limit) && Number(limit) >= 1 && Number(limit) <= 1000));
    if (!valid || !this.controllerReady || !this.rateLimitController?.stdin?.writable) {
      if (typeof requestId === 'string' && child.connected) child.send({ type: 'rate-limit:response', requestId, error: valid ? 'controller-restarting' : 'invalid-request' });
      return true;
    }
    const controllerRequestId = `${child.pid}-${++this.controllerRequestCounter}`;
    if (this.controllerRequests.size >= 1000) {
      child.send({ type: 'rate-limit:response', requestId, error: 'controller-overloaded' });
      return true;
    }
    const timer = setTimeout(() => {
      const route = this.controllerRequests.get(controllerRequestId);
      if (!route) return;
      this.controllerRequests.delete(controllerRequestId);
      if (route.child.connected) route.child.send({ type: 'rate-limit:response', requestId: route.workerRequestId, error: 'controller-timeout' });
    }, 2000);
    timer.unref?.();
    this.controllerRequests.set(controllerRequestId, { child, workerRequestId: requestId, timer });
    try { this.rateLimitController.stdin.write(`${JSON.stringify({ type: 'rate-limit:controller-request', requestId: controllerRequestId, operation, key, limit })}\n`); }
    catch {
      this.controllerRequests.delete(controllerRequestId);clearTimeout(timer);
      if (child.connected) child.send({ type: 'rate-limit:response', requestId, error: 'controller-unavailable' });
    }
    return true;
  }

  private _failControllerRequests(error: string) {
    for (const route of this.controllerRequests.values()) {
      clearTimeout(route.timer);
      if (route.child.connected) route.child.send({ type: 'rate-limit:response', requestId: route.workerRequestId, error });
    }
    this.controllerRequests.clear();
  }

  /**
   * Startet einen Worker-Prozess für den angegebenen Slot.
   */
  _spawnWorker(slot: number = 0) {
    if (this.isShuttingDown || !this.isRunning) return;

    const childEnv: NodeJS.ProcessEnv = {
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
    const clusterChild = cluster.fork(childEnv);
    const child = clusterChild.process;

    this.children.set(slot, child);
    const childPid = child.pid;

    const prefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}/${this.numWorkers}, PID: ${childPid})` : ` (PID: ${childPid})`;
    logger.info(`Anwendungsprozess gestartet${prefix}`, 'supervisor');

    // Stdout weiterleiten und erfassen
    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(text);
      });
    }

    // Stderr erfassen und als ERROR in die .log Datei loggen
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        process.stderr.write(text);
        const tag = this.numWorkers > 1 ? `worker-${slot + 1}-stderr` : 'worker-stderr';
        logger.writeRaw(text, tag);
      });
    }

    // IPC-Nachrichten (falls vorhanden)
    (process.versions.bun ? clusterChild : child).on('message', (message: unknown) => {
      const msg = asRecord(message);
      this.events.emit('worker-message', child, message);
      if (this._handleRateLimitRequest(child, msg)) return;
      if (msg && msg.type === 'ready') {
        const readyPrefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}, PID: ${childPid})` : ` (PID: ${childPid})`;
        logger.info(`Anwendungsprozess signalisiert Betriebsbereitschaft${readyPrefix}`, 'supervisor');
      }
    });

    child.on('error', (err: Error) => {
      const errPrefix = this.numWorkers > 1 ? ` (Slot: ${slot + 1}, PID: ${childPid})` : ` (PID: ${childPid})`;
      logger.error(`Fehler im Anwendungsprozess${errPrefix}: ${err.stack || err.message}`, 'supervisor');
    });

    const generation = this.generation;
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.children.get(slot) === child) this.children.delete(slot);

      if (this.isShuttingDown || generation !== this.generation) {
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
      this.crashTimestamps = this.crashTimestamps.filter((t: number) => now - t <= this.maxCrashWindowMs);

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

      const restartTimer = setTimeout(() => {
        this.restartTimers.delete(restartTimer);
        if (!this.isShuttingDown && this.isRunning && generation === this.generation) {
          this._spawnWorker(slot);
        }
      }, delay);
      this.restartTimers.add(restartTimer);
    });
  }

  /**
   * Signal-Handler für sauberes Beenden bei SIGTERM / SIGINT.
   */
  _bindProcessSignals() {
    if (this._boundSignals) return;
    this._boundSignals = true;

    process.once('SIGINT', this.onSigint);
    process.once('SIGTERM', this.onSigterm);
  }

  private handleSignal(sig: NodeJS.Signals) {
    logger.info(`Signal ${sig} empfangen. Beende Überwachungsprozess und Anwendung geordnet...`, 'supervisor');
    void this.stop().then(() => process.exit(0));
  }

  /**
   * Beendet alle überwachten Prozesse geordnet.
   */
  stop(): Promise<void> {
    this.generation++;
    process.removeListener('SIGINT', this.onSigint);
    process.removeListener('SIGTERM', this.onSigterm);
    this._boundSignals = false;
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopChildren().finally(() => { this.stopPromise = null; });
    return this.stopPromise;
  }

  private async stopChildren() {
    for (const timer of this.restartTimers) clearTimeout(timer);
    this.restartTimers.clear();
    this.isShuttingDown = true;
    this.isRunning = false;
    if (this.controllerRestartTimer) clearTimeout(this.controllerRestartTimer);
    this.controllerRestartTimer = null;
    this._failControllerRequests('supervisor-stopping');

    const controller = this.rateLimitController;
    this.rateLimitController = null;
    this.controllerReady = false;
    const currentChildren = [...Array.from(this.children.values()), ...(controller ? [controller] : [])];
    this.children.clear();
    if (currentChildren.length === 0) return;

    const stopPromises = currentChildren.map((child: ChildProcess) => {
      return new Promise<void>((resolve) => {
        let resolved = false;
        let killTimer: ReturnType<typeof setTimeout> | undefined = undefined;
        const done = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(killTimer);
            child.removeListener('exit', done);
            resolve();
          }
        };

        if (child.exitCode !== null || child.signalCode !== null) { done(); return; }
        child.once('exit', done);

        try {
          child.kill('SIGTERM');
        } catch { /* Best-effort cleanup or optional operation; failure is safe to ignore. */ }

        if (resolved) return;
        killTimer = setTimeout(() => {
          if (!resolved) {
            logger.warn(`Child-Prozess (PID: ${child.pid}) reagiert nicht auf SIGTERM, erzwinge Beenden (SIGKILL)...`, 'supervisor');
            try {
              child.kill('SIGKILL');
            } catch { /* Best-effort cleanup or optional operation; failure is safe to ignore. */ }
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
  restart(): Promise<void> {
    if (this.restartPromise) return this.restartPromise;
    logger.info('Manueller Neustart aller Anwendungsprozesse angefordert...', 'supervisor');
    const stopped = this.stop();
    const generation = this.generation;
    this.restartPromise = stopped.then(() => {
      if (generation === this.generation) this.start();
    }).finally(() => { this.restartPromise = null; });
    return this.restartPromise;
  }

  /**
   * Gibt den aktuellen Status des Supervisors zurück.
   */
  getStatus() {
    const workerPids = Array.from(this.children.values()).map((c: ChildProcess) => c.pid);
    return {
      running: this.isRunning,
      supervisorPid: process.pid,
      workerPid: this.child ? this.child.pid : null,
      workerPids,
      totalWorkers: this.children.size,
      targetWorkers: this.numWorkers,
      restarts: this.restartCount,
      recentCrashes: this.crashTimestamps.length,
      rateLimitControllerPid: this.rateLimitController?.pid || null,
      rateLimitControllerReady: this.controllerReady,
      rateLimitControllerRestarts: this.controllerRestartCount,
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      targetScript: this.targetScript,
    };
  }
}

export = {
  Supervisor,
};
