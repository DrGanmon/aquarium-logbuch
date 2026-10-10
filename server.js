'use strict';
const app = require('./src/app');
const { PORT } = require('./src/config/env');
const logger = require('./src/utils/logger');
const { Supervisor } = require('./src/services/supervisor');

if (require.main === module) {
  const isWorker = process.env.IS_SUPERVISED_WORKER === '1';
  const noSupervisor = process.env.NO_SUPERVISOR === '1' || process.env.SUPERVISOR === 'false';

  if (isWorker || noSupervisor) {
    // Uncaught Exceptions und unhandled Rejections protokollieren
    process.on('uncaughtException', (err) => {
      logger.fatal(err, 'worker-uncaught');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(reason instanceof Error ? reason : new Error(String(reason)), 'worker-unhandled');
    });

    (async () => {
      const db = require('./src/db');
      try {
        await db.init();
      } catch (err) {
        logger.fatal(`Datenbank-Initialisierung fehlgeschlagen: ${err.stack || err.message}`, 'db');
        process.exit(1);
      }

      const server = app.listen(PORT, () => {
        const mode = isWorker ? 'überwachten Worker-Modus' : 'Einzelprozess-Modus';
        logger.info(`Aquarium-Logbuch läuft auf http://localhost:${PORT} (PID: ${process.pid}, ${mode}, DB: ${db.type})`, 'server');
        if (typeof process.send === 'function') {
          process.send({ type: 'ready', pid: process.pid, port: PORT });
        }
      });

      server.on('error', (err) => {
        logger.fatal(`Server-Fehler: ${err.stack || err.message}`, 'server');
        process.exit(1);
      });

      const shutdown = async () => {
        logger.info(`Beende HTTP-Server (PID: ${process.pid})...`, 'server');
        server.close(async () => {
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
    supervisor.start();
  }
}

app.Supervisor = Supervisor;
app.logger = logger;

module.exports = app;
