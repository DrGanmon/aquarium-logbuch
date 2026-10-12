import { asError } from './src/utils/app-error';
'use strict';
import app = require('./src/app');
import envModule = require('./src/config/env');
const { PORT, WORKER_THREADS } = envModule;
import logger = require('./src/utils/logger');
import supervisorModule = require('./src/services/supervisor');
const { Supervisor } = supervisorModule;
import worker_poolModule = require('./src/utils/worker-pool');
const { workerPool } = worker_poolModule;
import backup_serviceModule = require('./src/services/backup-service');
const { backupService } = backup_serviceModule;
import reminder_serviceModule = require('./src/services/reminder-service');
const { reminderService } = reminder_serviceModule;

function startServer(): void {
  const isWorker = process.env.IS_SUPERVISED_WORKER === '1';
  const noSupervisor = process.env.NO_SUPERVISOR === '1' || process.env.SUPERVISOR === 'false';

  if (isWorker || noSupervisor) {
    // Uncaught Exceptions und unhandled Rejections protokollieren
    process.on('uncaughtException', (err: any) => {
      logger.fatal(err, 'worker-uncaught');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: any) => {
      logger.error(reason instanceof Error ? reason : new Error(String(reason)), 'worker-unhandled');
    });

    (async () => {
      const db = require('./src/db');
      try {
        await db.init();
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.fatal(`Datenbank-Initialisierung fehlgeschlagen: ${err.stack || err.message}`, 'db');
        process.exit(1);
      }

      // Initialisiere Worker Thread Pool für rechenintensive Aufgaben
      workerPool.init();

      // Starte automatischen Backup-Scheduler und Erinnerungs-Scheduler (nur in Worker #1 oder Einzelprozess)
      if (!process.env.WORKER_ID || process.env.WORKER_ID === '1') {
        backupService.startScheduler();
        reminderService.startScheduler();
      }

      // The supervisor's cluster workers share this port on Node and Bun.
      const server = app.listen(PORT, () => {
        const workerId = process.env.WORKER_ID ? `Worker ${process.env.WORKER_ID}/${process.env.WORKERS_TOTAL || '1'}` : 'Einzelprozess';
        const mode = isWorker ? `überwachten Modus (${workerId})` : 'Einzelprozess-Modus';
        logger.info(
          `Aquarium-Logbuch läuft auf http://localhost:${PORT} (PID: ${process.pid}, ${mode}, DB: ${db.type}, Threads: ${WORKER_THREADS})`,
          'server'
        );
        if (typeof process.send === 'function') {
          process.send({ type: 'ready', pid: process.pid, port: PORT });
        }
      });

      server.on('error', (err: any) => {
        logger.fatal(`Server-Fehler: ${err.stack || err.message}`, 'server');
        process.exit(1);
      });

      const shutdown = async () => {
        logger.info(`Beende HTTP-Server (PID: ${process.pid})...`, 'server');
        backupService.stopScheduler();
        reminderService.stopScheduler();
        server.close(async () => {
          try {
            await workerPool.terminate();
          } catch (e) {}
          try {
            await db.close();
          } catch (e) {}
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 2500).unref();
      };

      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
    })();
  } else {
    // Standard: Starte den Überwachungsprozess
    const supervisor = new Supervisor({
      targetScript: __filename,
    });
    // Finish migrations once before children open the same database concurrently.
    (async () => {
      try {
        await require('./src/db').init();
        supervisor.start();
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.fatal(`Datenbank-Initialisierung fehlgeschlagen: ${err.stack || err.message}`, 'db');
        process.exit(1);
      }
    })();
  }
}

if (require.main === module) startServer();

const serverApp = Object.assign(app, { Supervisor, logger, workerPool, backupService, startServer });
export = serverApp;
