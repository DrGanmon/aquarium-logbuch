/** Database connection details a backup worker needs for its own read-only snapshot. */
export interface BackupSnapshotSource { type: 'sqlite' | 'mongodb'; dbPath?: string; uri?: string; dbName?: string }
export interface BackupWorkerJob { source: BackupSnapshotSource; includeFiles: boolean; fullPath: string; password: string; returnArchive: boolean }
export interface BackupWorkerResult { size: number; archive?: Uint8Array; missingFiles: number }
