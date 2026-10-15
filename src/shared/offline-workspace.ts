/** Only these operations may be queued. Account/security, social, sharing and admin actions remain online. */
export interface WorkspaceOperation {
  id: string; owner: number; kind: 'workspace'; aquarium: string;
  method: 'POST' | 'PUT' | 'DELETE'; path: string; body: Record<string, any>;
  base: string | null; temporaryIds: number[]; createdAt: string; error?: string;
  conflict?: { current: unknown; version: string };
}
export interface WorkspaceSnapshot {
  schema: 1; version?: string; owner: number; language: string; updatedAt: string;
  responses: Record<string, any>; versions: Record<string, string>;
  rules: { profiles: Record<string, any>; parameters: any[] };
}
export const workspaceKey = (owner: number, lang: string) => `workspace:1:${owner}:${lang}`;
export function canonicalResource(path: string) {
  const clean = path.split('?')[0]!.replace(/^(\/aquariums\/-?\d+)\/image$/, '$1/images').replace(/\/dosing-pumps(?=\/|$)/g, '/fertilizers').replace(/\/(image|primary|dose)$/, '');
  if (clean.startsWith('/me/test-inventory/')) return '/me/test-inventory';
  return clean.replace(/(\/images)\/-?\d+$/, '$1');
}
export function workspaceWrite(path: string, method: string, body: Record<string, any> = {}) {
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false;
  if (path === '/me' && method === 'PUT') return Object.keys(body).every(key => ['username', 'firstName', 'lastName', 'bio', 'language', 'defaultGraphRange'].includes(key));
  if (/^\/me\/tests$/.test(path)) return method === 'PUT';
  if (/^\/me\/test-inventory\/[^/?]+$/.test(path)) return method === 'PUT';
  if (path === '/me/avatar') return method === 'POST' || method === 'DELETE';
  if (/^\/aquariums\/-?\d+\/measurements\/import-csv$/.test(path)) return method === 'POST';
  if (path === '/aquariums') return method === 'POST';
  if (/^\/aquariums\/-?\d+$/.test(path)) return method === 'PUT' || method === 'DELETE';
  if (/^\/aquariums\/-?\d+\/stock\/catalog$/.test(path)) return method === 'POST';
  if (/^\/aquariums\/-?\d+\/(stock|images|fertilizers|dosing-pumps|maintenance|measurements)$/.test(path)) return method === 'POST';
  if (/^\/aquariums\/-?\d+\/(stock|images|fertilizers|dosing-pumps|maintenance|measurements)\/-?\d+$/.test(path)) return method === 'DELETE' || (method === 'PUT' && !path.includes('/measurements/'));
  if (/^\/aquariums\/-?\d+\/plants\/[^/?]+$/.test(path)) return method === 'PUT' || method === 'DELETE';
  if (/^\/aquariums\/-?\d+\/images\/-?\d+\/primary$/.test(path)) return method === 'PUT';
  if (/^\/aquariums\/-?\d+\/(stock\/-?\d+\/image|image)$/.test(path)) return method === 'POST' || method === 'DELETE';
  if (/^\/aquariums\/-?\d+\/(fertilizers|dosing-pumps)\/-?\d+\/dose$/.test(path)) return method === 'POST';
  return /^\/aquariums\/-?\d+\/alerts\/ack$/.test(path) && method === 'POST';
}
