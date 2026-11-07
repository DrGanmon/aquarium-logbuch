import { parentPort, workerData } from 'node:worker_threads';
import { asError } from '../utils/app-error';
import type { BackupWorkerJob } from '../types/backup';

/**
 * Backup worker thread: opens its own read-only database snapshot, builds and encrypts the archive and
 * reports the result. The parent thread supervises it (time limit, crashes) and logs failures.
 */
async function run() {
  const job = workerData as BackupWorkerJob;
  const { backupService } = require('./backup-service') as typeof import('./backup-service');
  const result = await backupService.writeSnapshotArchive(job);
  // Copy into an own buffer: Node may place small buffers in a shared pool that must not be transferred.
  const archive = result.archive ? new Uint8Array(result.archive) : undefined;
  parentPort!.postMessage({ ok: true, size: result.size, missingFiles: result.missingFiles, archive }, archive ? [archive.buffer as ArrayBuffer] : []);
}

run().catch((caught: unknown) => {
  parentPort?.postMessage({ ok: false, error: asError(caught).message });
});
