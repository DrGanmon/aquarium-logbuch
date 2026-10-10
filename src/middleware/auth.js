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

function getAquariumAccess(aquariumId, user) {
  const id = Number(aquariumId);
  if (!Number.isInteger(id)) return null;
  const aq = db
    .prepare(
      `
    SELECT a.*, u.username AS owner_username, u.email AS owner_email
    FROM aquariums a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
  `
    )
    .get(id);
  if (!aq) return null;

  if (aq.user_id === user.id) {
    return { aq, role: 'owner' };
  }
  const share = db
    .prepare('SELECT role FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?')
    .get(id, user.id);
  if (share) {
    return { aq, role: share.role };
  }
  if (user.isAdmin) {
    return { aq, role: 'owner' };
  }
  return null;
}

function requireAquariumAccess(minRole = 'view') {
  const roleHierarchy = { view: 1, write: 2, owner: 3 };
  const requiredLevel = roleHierarchy[minRole] || 1;

  return (req, res, next) => {
    const id = Number(req.params.id);
    const access = getAquariumAccess(id, req.user);
    if (!access) {
      return res.status(404).json({ error: 'Aquarium nicht gefunden.' });
    }
    const userLevel = roleHierarchy[access.role] || 0;
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Keine ausreichenden Berechtigungen für diese Aktion.' });
    }
    req.aq = access.aq;
    req.accessRole = access.role;
    next();
  };
}

const ownAquarium = requireAquariumAccess('view');
const writeAquarium = requireAquariumAccess('write');
const ownerAquarium = requireAquariumAccess('owner');

module.exports = {
  auth,
  requireAdmin,
  getAquariumAccess,
  requireAquariumAccess,
  ownAquarium,
  writeAquarium,
  ownerAquarium,
};
