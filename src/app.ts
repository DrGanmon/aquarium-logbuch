import { isRecord } from './utils/validation';
import { asError } from './utils/app-error';
import type { Request, Response, NextFunction } from 'express';
import { acquireRequestLease, isBackupMaintenanceRequest } from './services/maintenance-coordinator';
import { APP_ROOT } from './utils/paths';
import express = require('express');
import path = require('path');
import fs = require('fs');

import envModule = require('./config/env');
const { APP_PATH } = envModule;
import securityModule = require('./middleware/security');
const { securityHeaders, csrfProtection } = securityModule;
import logger = require('./utils/logger');

import authRoutes = require('./routes/auth');
import configRoutes = require('./routes/config');
import aquariumRoutes = require('./routes/aquariums');
import shareRoutes = require('./routes/shares');
import adminRoutes = require('./routes/admin');
import oidcRoutes = require('./routes/oidc');
import socialRoutes = require('./routes/social');
import notificationRoutes = require('./routes/notifications');
import healthRoutes = require('./routes/health');
import metricsRoutes = require('./routes/metrics');
import setupRoutes = require('./routes/setup');

const app = express();
app.disable('x-powered-by');

// Hinter einem Reverse Proxy: TRUST_PROXY=1 setzen, damit die echte Client-IP für die Login-Begrenzung genutzt wird
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

app.use(securityHeaders);
const maintenanceGate = async (req: Request, res: Response, next: NextFunction) => {
  if (isBackupMaintenanceRequest(req.method, (req.originalUrl || req.url).split('?')[0])) return next();
  try {
    const lease = await acquireRequestLease();
    if (!lease) return res.status(503).json({ error: 'Die Anwendung führt gerade eine Datenbankwartung aus.' });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void lease.release().catch(error => logger.warn(`Wartungs-Lease konnte nicht freigegeben werden: ${String(error)}`, 'maintenance'));
    };
    res.once('finish', release);
    res.once('close', () => {
      if (res.writableFinished) release();
      else lease.abandon?.();
    });
    next();
  } catch {
    res.status(503).json({ error: 'Die gemeinsame Wartungssperre ist derzeit nicht verfügbar.' });
  }
};
app.use('/api', maintenanceGate);
app.use('/auth', maintenanceGate);
app.use('/metrics', maintenanceGate);
app.use(express.json({ limit: '50mb' }));
app.use('/api', csrfProtection);
app.use('/api', (req, res, next) => {
  if (req.body !== undefined && !isRecord(req.body)) return res.status(400).json({ error: 'JSON-Objekt erwartet.' });
  req.body ??= {};
  next();
});

// API Routen
app.use('/api', authRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api', configRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/aquariums', aquariumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/auth', oidcRoutes);
app.use('/metrics', metricsRoutes);

// Frontend: index.html mit <base href>, damit die App auch unter einem Unterpfad (APP_URL mit Pfad) läuft
const publicDir = path.join(APP_ROOT, 'public');

function getIndexHtml() {
  const hasDistMinJs = fs.existsSync(path.join(publicDir, 'dist', 'app.min.js'));
  const hasDistJs = fs.existsSync(path.join(publicDir, 'dist', 'app.js'));
  const hasDistMinCss = fs.existsSync(path.join(publicDir, 'dist', 'style.min.css'));
  const hasDistCss = fs.existsSync(path.join(publicDir, 'dist', 'style.css'));

  let jsSrc = null;
  if (hasDistMinJs) {
    jsSrc = 'dist/app.min.js';
  } else if (hasDistJs) {
    jsSrc = 'dist/app.js';
  }

  if (!jsSrc) return null;

  let cssSrc = 'style.css';
  if (hasDistMinCss) {
    cssSrc = 'dist/style.min.css';
  } else if (hasDistCss) {
    cssSrc = 'dist/style.css';
  }

  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  html = html.replace(/<script type="module" src="[^"]+"><\/script>/, `<script type="module" src="${jsSrc}"></script>`);
  html = html.replace(/<link rel="stylesheet" href="[^"]*style[^"]*\.css"\s*\/?>/, `<link rel="stylesheet" href="${cssSrc}">`);

  return html.replace('<head>', `<head>\n  <base href="${APP_PATH.replace(/["<>&]/g, '')}/">`);
}

const sendIndex = (req: Request, res: Response) => {
  const html = getIndexHtml();
  if (!html) return res.status(503).type('text').send('Frontend fehlt. Bitte npm run build oder npm run dist ausführen. Für Entwicklung: npm run dev.');
  return res.type('html').setHeader('Cache-Control', 'no-cache').send(html);
};

app.get(['/', '/index.html'], sendIndex);
app.get('/sw.js', (req: Request, res: Response) => res.setHeader('Cache-Control', 'no-cache').sendFile(path.join(publicDir, 'dist', 'sw.js')));
app.get('/dist/version.json', (req: Request, res: Response) => res.setHeader('Cache-Control', 'no-store').sendFile(path.join(publicDir, 'dist', 'version.json')));
app.use(express.static(publicDir, { maxAge: 0, setHeaders(res, filename) {
  if (/[/\\]chunk-[^/\\]+-[A-Za-z0-9_-]+\.js$/.test(filename)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
} }));

// 404 Handler
app.use('/api', (req: Request, res: Response) => res.status(404).json({ error: 'Nicht gefunden.' }));
app.use((req: Request, res: Response) => (req.method === 'GET' ? sendIndex(req, res) : res.status(404).end()));

// Globaler Express-Fehlerbehandler: Protokolliert Fehler in die .log-Datei und sendet 500
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const err = asError(error);
  logger.error(`Express-Fehler bei ${req.method} ${req.originalUrl || req.url}: ${err.stack || err.message}`, 'express');
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.userMessage || 'Ein interner Serverfehler ist aufgetreten.' });
});

export = app;
