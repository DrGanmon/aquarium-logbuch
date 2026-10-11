'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');

const { APP_PATH } = require('./config/env');
const { securityHeaders, csrfProtection } = require('./middleware/security');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const aquariumRoutes = require('./routes/aquariums');
const shareRoutes = require('./routes/shares');
const adminRoutes = require('./routes/admin');
const oidcRoutes = require('./routes/oidc');

const app = express();
app.disable('x-powered-by');

// Hinter einem Reverse Proxy: TRUST_PROXY=1 setzen, damit die echte Client-IP für die Login-Begrenzung genutzt wird
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

app.use(express.json({ limit: '50mb' }));
app.use(securityHeaders);
app.use('/api', csrfProtection);

// API Routen
app.use('/api', authRoutes);
app.use('/api', configRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/aquariums', aquariumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/auth', oidcRoutes);

// Frontend: index.html mit <base href>, damit die App auch unter einem Unterpfad (APP_URL mit Pfad) läuft
const publicDir = path.join(__dirname, '..', 'public');
const INDEX_HTML = fs
  .readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  .replace('<head>', `<head>\n  <base href="${APP_PATH.replace(/["<>&]/g, '')}/">`);

const sendIndex = (req, res) => res.type('html').setHeader('Cache-Control', 'no-cache').send(INDEX_HTML);

app.get(['/', '/index.html'], sendIndex);
app.get('/vendor/chart.js', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
);
app.use(express.static(publicDir, { maxAge: 0 }));

// 404 Handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
app.use((req, res) => (req.method === 'GET' ? sendIndex(req, res) : res.status(404).end()));

// Globaler Express-Fehlerbehandler: Protokolliert Fehler in die .log-Datei und sendet 500
app.use((err, req, res, next) => {
  logger.error(`Express-Fehler bei ${req.method} ${req.originalUrl || req.url}: ${err.stack || err.message}`, 'express');
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.userMessage || 'Ein interner Serverfehler ist aufgetreten.' });
});

module.exports = app;
