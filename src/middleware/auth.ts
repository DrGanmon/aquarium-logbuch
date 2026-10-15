import type { Aquarium, AccessRole, SessionUser } from '../types/domain';
import { asError } from '../utils/app-error';
import type { Request, Response, NextFunction } from 'express';
import db = require('../db');
import cryptoModule = require('../utils/crypto');
const { sha } = cryptoModule;
import cookiesModule = require('../utils/cookies');
const { parseCookies } = cookiesModule;

async function auth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req).session;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
  try {
    const row = await db.sessions.find(sha(token));
    if (!row || row.expires_at < Date.now()) {
      return res.status(401).json({ error: 'Sitzung abgelaufen.' });
    }
    req.user = {
      id: row.user_id,
      username: row.username,
      email: row.email || null,
      language: row.language || 'de',
      isAdmin: Boolean(row.is_admin),
    };
    res.setHeader('X-Aquarium-User', String(req.user.id));
    next();
  } catch (caught: unknown) {
    const e = asError(caught);
    next(e);
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Zugriff verweigert. Administrator-Rechte erforderlich.' });
  }
  next();
}

async function getAquariumAccess(aquariumId: number | string, user: SessionUser): Promise<{ aq: Aquarium; role: AccessRole } | null> {
  return await db.aquariums.getAccess(aquariumId, user);
}

function requireAquariumAccess(minRole: AccessRole = 'view') {
  const roleHierarchy: Record<AccessRole, number> = { view: 1, write: 2, owner: 3 };
  const requiredLevel = roleHierarchy[minRole] || 1;

  return async (req: Request, res: Response, next: NextFunction) => {
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
    } catch (caught: unknown) {
      const e = asError(caught);
      next(e);
    }
  };
}

const ownAquarium = requireAquariumAccess('view');
const writeAquarium = requireAquariumAccess('write');
const ownerAquarium = requireAquariumAccess('owner');

export = {
  auth,
  requireAdmin,
  getAquariumAccess,
  requireAquariumAccess,
  ownAquarium,
  writeAquarium,
  ownerAquarium,
};
