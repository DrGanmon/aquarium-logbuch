import type { CatalogName } from './offline-catalog';
export class CatalogLookupError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export function catalogForPath(path: string): CatalogName | undefined {
  const pathname = path.split('?')[0]!;
  if (/^\/species(?:\/[^/]+)?$/.test(pathname)) return 'species';
  if (/^\/plants(?:\/[^/]+)?$/.test(pathname)) return 'plants';
  if (/^\/health\/(?:catalog|diseases\/[^/]+|medications(?:\/[^/]+)?)$/.test(pathname)) return 'health';
}
