import type { Request, Response, NextFunction } from 'express';

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'"
  );
  next();
}

function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const hasBody = Number(req.headers['content-length'] || 0) > 0;
    if (hasBody && !req.is('application/json')) {
      return res.status(415).json({ error: 'Nur JSON erlaubt.' });
    }
    if (!req.headers['x-requested-with']) {
      return res.status(403).json({ error: 'Anfrage abgelehnt.' });
    }
  }
  next();
}

export = {
  securityHeaders,
  csrfProtection,
};
