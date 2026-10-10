'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const { TASK_HANDLERS } = require('./thread-worker');

class WorkerPool {
  constructor(options = {}) {
    const defaultWorkers = Math.min(4, Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
    this.numWorkers = Number(options.numWorkers || process.env.WORKER_THREADS || defaultWorkers);
    this.workerPath = options.workerPath || path.resolve(__dirname, './thread-worker.js');
    this.workers = [];
    this.freeWorkers = [];
    this.queue = [];
    this.taskId = 0;
    this.pendingTasks = new Map();
    this.isTerminated = false;
    this._initialized = false;
  }

  init() {
    if (this._initialized || this.isTerminated) return this;
    for (let i = 0; i < this.numWorkers; i++) {
      this._createWorker(i);
    }
    this._initialized = true;
    return this;
  }

  _createWorker(index) {
    if (this.isTerminated) return;
    try {
      const worker = new Worker(this.workerPath);
      worker.poolIndex = index;
      worker.isBusy = false;
      worker.unref();

      worker.on('message', (msg) => {
        const { id, success, result, error } = msg;
        const task = this.pendingTasks.get(id);
        if (task) {
          this.pendingTasks.delete(id);
          if (success) {
            task.resolve(result);
          } else {
            task.reject(new Error(error));
          }
        }
        worker.isBusy = false;
        worker.unref();
        this.freeWorkers.push(worker);
        this._dispatchNext();
      });

      worker.on('error', (err) => {
        console.error(`Worker Thread #${index} Fehler:`, err.message);
        this._replaceWorker(worker, index);
      });

      worker.on('exit', (code) => {
        if (!this.isTerminated && code !== 0) {
          console.warn(`Worker Thread #${index} unerwartet beendet mit Code ${code}`);
          this._replaceWorker(worker, index);
        }
      });

      this.workers[index] = worker;
      this.freeWorkers.push(worker);
    } catch (err) {
      console.warn(`Worker Threads nicht verfügbar: ${err.message}. Verwende Fallback.`);
    }
  }

  _replaceWorker(oldWorker, index) {
    const idx = this.freeWorkers.indexOf(oldWorker);
    if (idx !== -1) this.freeWorkers.splice(idx, 1);
    try {
      oldWorker.terminate();
    } catch (e) {}
    this._createWorker(index);
  }

  _dispatchNext() {
    if (this.isTerminated || this.queue.length === 0 || this.freeWorkers.length === 0) {
      return;
    }
    const worker = this.freeWorkers.pop();
    const task = this.queue.shift();
    worker.isBusy = true;
    worker.ref();
    this.pendingTasks.set(task.id, task);
    worker.postMessage({ id: task.id, task: task.name, payload: task.payload });
  }

  async exec(taskName, payload = {}) {
    // Falls WorkerPool noch nicht initialisiert oder keine Worker Threads verfügbar: Fallback auf Direktaufruf
    if (!this._initialized && !this.isTerminated) {
      this.init();
    }

    if (this.isTerminated || this.workers.length === 0) {
      const handler = TASK_HANDLERS[taskName];
      if (!handler) throw new Error(`Unbekannter Task: ${taskName}`);
      return handler(payload);
    }

    const id = ++this.taskId;
    return new Promise((resolve, reject) => {
      this.queue.push({ id, name: taskName, payload, resolve, reject });
      this._dispatchNext();
    });
  }

  async terminate() {
    this.isTerminated = true;
    for (const [, task] of this.pendingTasks) {
      task.reject(new Error('WorkerPool wurde beendet.'));
    }
    this.pendingTasks.clear();
    this.queue = [];
    const termPromises = this.workers.map((w) => w.terminate());
    this.workers = [];
    this.freeWorkers = [];
    this._initialized = false;
    await Promise.allSettled(termPromises);
  }
}

const defaultPool = new WorkerPool();

module.exports = {
  WorkerPool,
  workerPool: defaultPool,
};
