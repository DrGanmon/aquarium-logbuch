import type { RequestHandler, Request, Response } from 'express';
import logger = require('./logger');

function reportError(error: unknown, req: Request, res: Response): void {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  logger.error(`Fehler bei ${req.method} ${req.originalUrl || req.url}: ${detail}`, 'api');
  if (!res.headersSent) res.status(500).json({ error: 'Interner Fehler.' });
}
/** Catch synchronous throws and rejected promises from Express handlers. */
const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => reportError(error, req, res));
  } catch (error) { reportError(error, req, res); }
};
const str = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
function fmt(parameter: { decimals: number; unit?: string }, value: number): string {
  return `${Number(value).toFixed(parameter.decimals).replace('.', ',')}${parameter.unit ? ' ' + parameter.unit : ''}`;
}
export = { wrap, str, fmt };
