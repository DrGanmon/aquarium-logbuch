import type { Request, Response } from 'express';
'use strict';
import express = require('express');
import db = require('../db');
import helpersModule = require('../utils/helpers');
const { wrap } = helpersModule;
import authModule = require('../middleware/auth');
const { auth } = authModule;

const router = express.Router();

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

      await db.shares.acceptByToken(token, share.user_id);
      return res.json({
        ok: true,
        aquarium_id: share.aquarium_id,
        aquarium_name: share.aquarium_name,
        message: 'Einladung erfolgreich angenommen! Das Aquarium steht dir jetzt zur Verfügung.',
      });
    }

    // Falls per aquarium_id und Session angenommen wird
    if (!req.headers.cookie) {
      return res.status(401).json({ error: 'Nicht angemeldet.' });
    }

    // auth Middleware simulieren / aufrufen
    return auth(req, res, async () => {
      if (!aquariumId) return res.status(400).json({ error: 'Bitte Aquarium oder Token angeben.' });
      const share = await db.shares.find(aquariumId, req.user.id);
      if (!share) return res.status(404).json({ error: 'Keine Einladung für dieses Aquarium gefunden.' });

      await db.shares.accept(aquariumId, req.user.id);
      res.json({
        ok: true,
        aquarium_id: aquariumId,
        message: 'Einladung erfolgreich angenommen!',
      });
    });
  })
);

/**
 * POST /api/shares/decline
 * Lehnt eine Einladung per Token oder aquarium_id ab.
 */
router.post(
  '/decline',
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

    if (!req.headers.cookie) {
      return res.status(401).json({ error: 'Nicht angemeldet.' });
    }

    return auth(req, res, async () => {
      if (!aquariumId) return res.status(400).json({ error: 'Bitte Aquarium oder Token angeben.' });
      await db.shares.decline(aquariumId, req.user.id);
      res.json({ ok: true, message: 'Einladung wurde abgelehnt.' });
    });
  })
);

export = router;
