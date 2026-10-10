'use strict';
const logger = require('./logger');

const wrap = (fn) => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch((e) => {
        logger.error(`Fehler bei ${req.method} ${req.originalUrl || req.url}: ${e.stack || e.message}`, 'api');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Interner Fehler.' });
        }
      });
    }
  } catch (e) {
    logger.error(`Fehler bei ${req.method} ${req.originalUrl || req.url}: ${e.stack || e.message}`, 'api');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Interner Fehler.' });
    }
  }
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function fmt(p, v) {
  return `${Number(v).toFixed(p.decimals).replace('.', ',')}${p.unit ? ' ' + p.unit : ''}`;
}

module.exports = {
  wrap,
  str,
  fmt,
};
