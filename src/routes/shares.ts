import type { Request, Response } from 'express';
import express = require('express');
import db = require('../db');
import helpersModule = require('../utils/helpers');
const { wrap } = helpersModule;
import authModule = require('../middleware/auth');
const { auth } = authModule;

const router = express.Router();
// Token possession authorizes token-based actions; aquarium-ID actions require a session.
const authenticateIdAction: express.RequestHandler = (req, res, next) => {
  if (req.body.token !== undefined && (typeof req.body.token !== 'string' || req.body.token.length > 128))
    return res.status(400).json({ error: 'Ungültiges Einladungstoken.' });
  return typeof req.body.token === 'string' && req.body.token.trim() ? next() : auth(req, res, next);
};

/**
 * GET /api/shares/pending
 * Liefert alle ausstehenden Einladungen zu geteilten Aquarien für den angemeldeten Benutzer.
 */
router.get(
  '/pending',
  auth,
  wrap(async (req: Request, res: Response) => {
    const list = await db.shares.listPendingForUser(req.user.id);
    res.json(list);
  })
);

/**
 * GET /api/shares/invite/:token
 * Prüft ein Einladungstoken und liefert Details zur Freigabe (auch ohne Anmeldung aufrufbar).
 */
router.get(
  '/invite/:token',
  wrap(async (req: Request, res: Response) => {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Kein Token übergeben.' });

    const share = await db.shares.findByToken(token);
    if (!share) {
      return res.status(404).json({ error: 'Ungültiger oder abgelaufener Einladungslink.' });
    }

    if (share.status === 'accepted') {
      return res.status(400).json({ error: 'Diese Einladung wurde bereits angenommen.', alreadyAccepted: true });
    }

    if (share.token_expires && share.token_expires < Date.now()) {
      return res.status(400).json({ error: 'Dieser Einladungslink ist leider abgelaufen.', expired: true });
    }

    res.json({
      valid: true,
      aquarium_id: share.aquarium_id,
      aquarium_name: share.aquarium_name,
      water_type: share.water_type,
      volume_l: share.volume_l,
      owner_username: share.owner_username,
      target_username: share.target_username,
      target_email: share.target_email,
      role: share.role,
      roleLabel: share.role === 'write' ? 'Schreibrechte (Werte erfassen & bearbeiten)' : 'Leserechte (Werte & Verlauf ansehen)',
      created_at: share.created_at,
      expires_at: share.token_expires,
    });
  })
);

/**
 * POST /api/shares/accept
 * Nimmt eine Einladung per Token oder aquarium_id an.
 */
router.post(
  '/accept',
  authenticateIdAction,
  wrap(async (req: Request, res: Response) => {
    const token = req.body.token ? String(req.body.token).trim() : null;
    const aquariumId = req.body.aquarium_id != null ? Number(req.body.aquarium_id) : null;

    if (token) {
      const share = await db.shares.findByToken(token);
      if (!share) {
        return res.status(404).json({ error: 'Ungültiger oder abgelaufener Einladungslink.' });
      }
      if (share.token_expires && share.token_expires < Date.now()) {
        return res.status(400).json({ error: 'Dieser Einladungslink ist leider abgelaufen.' });
      }

      if (!await db.shares.acceptByToken(token, share.user_id)) return res.status(400).json({ error: 'Einladung abgelaufen, ersetzt oder bereits angenommen.' });
      return res.json({
        ok: true,
        aquarium_id: share.aquarium_id,
        aquarium_name: share.aquarium_name,
        message: 'Einladung erfolgreich angenommen! Das Aquarium steht dir jetzt zur Verfügung.',
      });
    }

    if (!Number.isSafeInteger(aquariumId) || !aquariumId || aquariumId < 1) return res.status(400).json({ error: 'Bitte eine gültige Aquarium-ID angeben.' });
    const share = await db.shares.find(aquariumId, req.user.id);
    if (!share) return res.status(404).json({ error: 'Keine Einladung für dieses Aquarium gefunden.' });
    if (!await db.shares.accept(aquariumId, req.user.id)) return res.status(400).json({ error: 'Einladung abgelaufen oder bereits angenommen.' });
    res.json({ ok: true, aquarium_id: aquariumId, message: 'Einladung erfolgreich angenommen!' });
  })
);

/**
 * POST /api/shares/decline
 * Lehnt eine Einladung per Token oder aquarium_id ab.
 */
router.post(
  '/decline',
  authenticateIdAction,
  wrap(async (req: Request, res: Response) => {
    const token = req.body.token ? String(req.body.token).trim() : null;
    const aquariumId = req.body.aquarium_id != null ? Number(req.body.aquarium_id) : null;

    if (token) {
      const share = await db.shares.findByToken(token);
      if (!share) {
        return res.status(404).json({ error: 'Ungültiger oder abgelaufener Einladungslink.' });
      }
      await db.shares.declineByToken(token);
      return res.json({ ok: true, message: 'Einladung wurde abgelehnt.' });
    }

    if (!Number.isSafeInteger(aquariumId) || !aquariumId || aquariumId < 1) return res.status(400).json({ error: 'Bitte eine gültige Aquarium-ID angeben.' });
    await db.shares.decline(aquariumId, req.user.id);
    res.json({ ok: true, message: 'Einladung wurde abgelehnt.' });
  })
);

export = router;
