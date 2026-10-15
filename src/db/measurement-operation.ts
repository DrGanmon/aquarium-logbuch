/** Receipts survive measurement deletion so a delayed retry never recreates it. */
export function replayMeasurement(receipt: { request_hash: string; response: string }, requestHash: string) {
  if (receipt.request_hash !== requestHash) {
    throw Object.assign(new Error('Diese operation_id wurde bereits für eine andere Messung verwendet.'), { status: 409 });
  }
  return JSON.parse(receipt.response) as { id: number; alerts: unknown[] };
}
