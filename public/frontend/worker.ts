import { executeTask, type WorkerTasks } from "./worker-tasks";
self.addEventListener(
  "message",
  async (
    event: MessageEvent<{
      id: number;
      type: keyof WorkerTasks;
      payload: WorkerTasks[keyof WorkerTasks]["input"];
    }>,
  ) => {
    const { id, type, payload } = event.data;
    try {
      self.postMessage({ id, result: await executeTask(type, payload) });
    } catch (error) {
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
