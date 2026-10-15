import express from 'express';
import authModule = require('../middleware/auth');
import { applyWorkspaceOperation, workspaceSnapshot } from '../services/offline-workspace-service';
const router = express.Router();
router.get('/state', authModule.auth, async (req, res, next) => {
  try {
    const snapshot = await workspaceSnapshot(req), etag = `"${snapshot.version}"`;
    res.setHeader('Cache-Control', 'private, no-cache');res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(snapshot);
  }
  catch (error) { next(error); }
});
router.post('/operations', authModule.auth, async (req, res, next) => {
  try { res.json(await applyWorkspaceOperation(req, req.body)); }
  catch (error) {
    const detail = error as { status?: number; message?: string; conflict?: unknown };
    if (detail.status) res.status(detail.status).json({ error: detail.message, conflict: detail.conflict });
    else next(error);
  }
});
export = router;
