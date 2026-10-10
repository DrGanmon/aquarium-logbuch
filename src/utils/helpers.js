'use strict';

const wrap = (fn) => (req, res, next) => {
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch((e) => {
        console.error(e);
        res.status(500).json({ error: 'Interner Fehler.' });
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Interner Fehler.' });
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
