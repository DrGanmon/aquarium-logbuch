export interface ImageInfo { ext: 'jpg' | 'png' | 'gif' | 'webp'; mime: string; size: number }
export interface Statistics { count: number; min: number; max: number; avg: number }
export interface TaskPayloads {
  hashPassword: { pw: string; saltHex?: string };
  verifyPassword: { pw: string; stored: string };
  inspectImage: { buffer: Uint8Array };
  computeStats: { measurements: { values?: Record<string, number | string | null> }[]; params: string[] };
}
export interface TaskResults { hashPassword: string; verifyPassword: boolean; inspectImage: ImageInfo | null; computeStats: Record<string, Statistics> }
export type TaskName = keyof TaskPayloads;
export type WorkerRequest = { [K in TaskName]: { id: number; task: K; payload: TaskPayloads[K] } }[TaskName];
export type WorkerReply = { id: number; success: true; result: TaskResults[TaskName] } | { id: number; success: false; error: string };
