import { executeTask, type WorkerTasks } from "./worker-tasks";
let worker: Worker | undefined;
let requestId = 0;
const pending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
export function disposeWorker() {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("Worker beendet."));
  }
  pending.clear();
}
export async function runWorkerTask<K extends keyof WorkerTasks>(
  type: K,
  payload: WorkerTasks[K]["input"],
): Promise<WorkerTasks[K]["output"]> {
  if (typeof Worker === "undefined") return executeTask(type, payload);
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const instance = worker;
    worker.onmessage = (
      event: MessageEvent<{ id: number; result: unknown; error?: string }>,
    ) => {
      if (worker !== instance) return;
      const request = pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data.result);
    };
    worker.onerror = () => { if (worker === instance) disposeWorker(); };
  }
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Worker-Zeitlimit überschritten."));
      disposeWorker();
    }, 30000);
    pending.set(id, {
      resolve: (value) => resolve(value as WorkerTasks[K]["output"]),
      reject,
      timer,
    });
    try { worker!.postMessage({ id, type, payload }); }
    catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
