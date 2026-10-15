/** Receipts survive entry deletion so a delayed retry never recreates it. */
export function replayOperation<T = { id: number }>(receipt: { request_hash: string; response: string }, requestHash: string) {
  if (receipt.request_hash !== requestHash) {
    throw Object.assign(new Error('Diese operation_id wurde bereits für einen anderen Eintrag verwendet.'), { status: 409 });
  }
  return JSON.parse(receipt.response) as T;
}

export function replayMeasurement(receipt: { request_hash: string; response: string }, requestHash: string) {
  return replayOperation<{ id: number; alerts: unknown[] }>(receipt, requestHash);
}
