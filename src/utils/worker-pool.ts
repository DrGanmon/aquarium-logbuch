import { Worker } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';
import { asError } from './app-error';
import threadWorker = require('./thread-worker');
import type { TaskName, TaskPayloads, TaskResults, WorkerReply } from '../types/worker';
interface PoolWorker extends Worker { poolIndex: number; isBusy: boolean; taskId?: number }
interface PendingTask { id: number; name: TaskName; payload: TaskPayloads[TaskName]; resolve: (value: unknown) => void; reject: (error: Error) => void }
interface WorkerPoolOptions { numWorkers?: number; workerPath?: string; maxQueuedTasks?: number }
class WorkerPool {
  readonly numWorkers: number;
  readonly workerPath: string;
  private workers = new Map<number, PoolWorker>();
  private freeWorkers: PoolWorker[] = [];
  private queue: PendingTask[] = [];
  private taskId = 0;
  private pendingTasks = new Map<number, PendingTask>();
  private isTerminated = false;
  private _initialized = false;
  private failures = new Map<number, number>();
  private readonly maxQueuedTasks: number;
  constructor(options: WorkerPoolOptions = {}) {
    const defaultWorkers = Math.min(4, Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    const requested = options.numWorkers ?? (process.env.WORKER_THREADS === 'auto'
      ? Math.max(1, Math.floor((os.availableParallelism?.() || os.cpus().length) / (Number(process.env.WORKERS_TOTAL) || 1)))
      : Number(process.env.WORKER_THREADS) || defaultWorkers);
    this.numWorkers = Math.min(64, Math.max(1, Math.trunc(requested) || defaultWorkers));
    this.maxQueuedTasks = Math.max(1, Math.trunc(options.maxQueuedTasks || 1024));
    this.workerPath = options.workerPath || path.resolve(__dirname, './thread-worker.js');
  }
  init(): this {
    if (this._initialized || this.isTerminated) return this;
    for (let index = 0; index < this.numWorkers; index++) this._createWorker(index);
    this._initialized = true;
    return this;
  }
  private _createWorker(index: number): void {
    if (this.isTerminated) return;
    try {
      const worker = new Worker(this.workerPath) as PoolWorker;
      worker.poolIndex = index;
      worker.isBusy = false;
      worker.unref();
      worker.on('message', (message: WorkerReply) => {
        if (!message || this.workers.get(index) !== worker || message.id !== worker.taskId) return;
        const task = this.pendingTasks.get(message.id);
        if (!task) return;
        this.pendingTasks.delete(message.id);
        this.failures.delete(index);
        if (message.success) task.resolve(message.result);
        else task.reject(new Error(message.error));
        worker.taskId = undefined;
        worker.isBusy = false;
        worker.unref();
        this.freeWorkers.push(worker);
        this._dispatchNext();
      });
      worker.on('error', (error: Error) => {
        console.error(`Worker Thread #${index} Fehler:`, error.message);
        this._replaceWorker(worker, index);
      });
      worker.on('exit', (code: number) => {
        if (!this.isTerminated) this._replaceWorker(worker, index);
      });
      this.workers.set(index, worker);
      this.freeWorkers.push(worker);
      this._dispatchNext();
    } catch (error) { console.warn(`Worker Threads nicht verfügbar: ${asError(error).message}. Verwende Fallback.`); }
  }
  private _replaceWorker(oldWorker: PoolWorker, index: number): void {
    // error and exit can report the same failure; replace each worker once.
    if (this.workers.get(index) !== oldWorker || this.isTerminated) return;
    this.workers.delete(index);
    this.freeWorkers = this.freeWorkers.filter(worker => worker !== oldWorker);
    if (oldWorker.taskId !== undefined) {
      this.pendingTasks.get(oldWorker.taskId)?.reject(new Error('Worker wurde während des Auftrags beendet.'));
      this.pendingTasks.delete(oldWorker.taskId);
    }
    void oldWorker.terminate().catch(() => {});
    const failures = (this.failures.get(index) || 0) + 1;
    this.failures.set(index, failures);
    if (failures < 3) this._createWorker(index);
    if (!this.workers.size) {
      for (const task of this.queue.splice(0)) {
        void threadWorker.executeTask(task.name, task.payload).then(task.resolve, task.reject);
      }
    }
  }
  private _dispatchNext(): void {
    if (this.isTerminated || !this.queue.length || !this.freeWorkers.length) return;
    const worker = this.freeWorkers.pop()!;
    const task = this.queue.shift()!;
    worker.isBusy = true;
    worker.taskId = task.id;
    worker.ref();
    this.pendingTasks.set(task.id, task);
    try { worker.postMessage({ id: task.id, task: task.name, payload: task.payload }); }
    catch (error) {
      this.pendingTasks.delete(task.id);
      worker.taskId = undefined;
      worker.isBusy = false;
      worker.unref();
      this.freeWorkers.push(worker);
      task.reject(asError(error));
      queueMicrotask(() => this._dispatchNext());
    }
  }
  async exec<K extends TaskName>(name: K, payload: TaskPayloads[K]): Promise<TaskResults[K]> {
    if (this.isTerminated) throw new Error('WorkerPool wurde beendet.');
    if (!this._initialized) this.init();
    if (!this.workers.size) return threadWorker.executeTask(name, payload);
    if (this.queue.length >= this.maxQueuedTasks) throw new Error('Worker-Warteschlange ist voll.');
    const id = ++this.taskId;
    return new Promise<TaskResults[K]>((resolve, reject) => {
      this.queue.push({ id, name, payload, resolve: result => resolve(result as TaskResults[K]), reject });
      this._dispatchNext();
    });
  }
  async terminate(): Promise<void> {
    this.isTerminated = true;
    for (const task of [...this.pendingTasks.values(), ...this.queue]) task.reject(new Error('WorkerPool wurde beendet.'));
    this.pendingTasks.clear();
    this.queue = [];
    const workers = [...this.workers.values()];
    this.workers.clear();
    this.freeWorkers = [];
    this._initialized = false;
    await Promise.allSettled(workers.map(worker => worker.terminate()));
  }
}
const workerPool = new WorkerPool();
export = { WorkerPool, workerPool };
