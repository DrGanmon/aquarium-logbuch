'use strict';
const db = require('../db');
const { isEmailAdmin } = require('../config/env');
const { sha } = require('../utils/crypto');
const { parseCookies } = require('../utils/cookies');

function auth(req, res, next) {
  const token = parseCookies(req).session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
  const row = db
    .prepare('SELECT u.id, u.username, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(sha(token));
  if (!row || row.expires_at < Date.now()) {
    return res.status(401).json({ error: 'Sitzung abgelaufen.' });
  }
  req.user = {
    id: row.id,
    username: row.username,
    email: row.email || null,
    isAdmin: isEmailAdmin(row.email),
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Zugriff verweigert. Administrator-Rechte erforderlich.' });
  }
  next();
}

function ownAquarium(req, res, next) {
  const id = Number(req.params.id);
  const aq = db.prepare('SELECT * FROM aquariums WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!aq) return res.status(404).json({ error: 'Aquarium nicht gefunden.' });
  req.aq = aq;
  next();
}

module.exports = {
  auth,
  requireAdmin,
  ownAquarium,
};
