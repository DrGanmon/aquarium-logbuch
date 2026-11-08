import { offlineState } from "../offline-store";

/**
 * True while an entry only exists on this device or has local changes that are still queued.
 * Offline-created entries carry negative temporary IDs until the server confirms them.
 */
export function isUnsynced(id: unknown, ...paths: string[]) {
  if (Number(id) < 0) return true;
  return offlineState.pending.some(item => item.kind === "workspace" && paths.some(path => item.path === path || item.path.startsWith(`${path}/`)));
}
