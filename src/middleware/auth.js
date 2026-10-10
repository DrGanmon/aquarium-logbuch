'use strict';
const db = require('../db');
const { isEmailAdmin } = require('../config/env');
const { sha } = require('../utils/crypto');
const { parseCookies } = require('../utils/cookies');

async function auth(req, res, next) {
  const token = parseCookies(req).session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
  try {
    const row = await db.sessions.find(sha(token));
    if (!row || row.expires_at < Date.now()) {
      return res.status(401).json({ error: 'Sitzung abgelaufen.' });
    }
    req.user = {
      id: row.user_id || row.id,
      username: row.username,
      email: row.email || null,
      isAdmin: isEmailAdmin(row.email),
    };
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Zugriff verweigert. Administrator-Rechte erforderlich.' });
  }
  next();
}

async function getAquariumAccess(aquariumId, user) {
  return await db.aquariums.getAccess(aquariumId, user);
}

function requireAquariumAccess(minRole = 'view') {
  const roleHierarchy = { view: 1, write: 2, owner: 3 };
  const requiredLevel = roleHierarchy[minRole] || 1;

  return async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const access = await getAquariumAccess(id, req.user);
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
    } catch (e) {
      next(e);
    }
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
