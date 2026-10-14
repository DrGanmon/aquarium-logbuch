import type { Response } from 'express';

/** App progress events describe actual request stages, never private model reasoning. */
export function chatProgress(res: Response, enabled: boolean) {
  const write = (event: object) => {
    if (!enabled || res.destroyed || res.writableEnded) return;
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
  return {
    status: (stage: string) => write({ type: 'status', stage }),
    done: (result: object) => { write({ type: 'done', ...result });if (enabled) res.end(); },
    error: (message: string) => { write({ type: 'error', error: message });if (enabled) res.end(); },
  };
}
