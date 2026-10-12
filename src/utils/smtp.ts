import { asError } from './app-error';
'use strict';
import net = require('net');
import tls = require('tls');
import crypto = require('crypto');

/**
 * Erstellt eine MIME-kodierte E-Mail mit text/plain und text/html Alternativen.
 */
function createMimeMessage({ from, to, subject, html, text, messageId, messageIdDomain }: any) {
  const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const domain = messageIdDomain || 'aquarium-logbuch.local';
  const msgId = messageId || `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;
  const dateStr = new Date().toUTCString();

  // RFC 2047 Encoding für Betreff
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `Date: ${dateStr}`,
    `Message-ID: ${msgId}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const bodyParts = [];

  if (text) {
    bodyParts.push(
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      Buffer.from(text, 'utf8').toString('base64')
    );
  }

  if (html) {
    bodyParts.push(
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      Buffer.from(html, 'utf8').toString('base64')
    );
  }

  bodyParts.push(`--${boundary}--`, '');

  return { mimeContent: headers.join('\r\n') + '\r\n\r\n' + bodyParts.join('\r\n'), messageId: msgId };
}

/**
 * Extrahiert eine reine E-Mail-Adresse aus Strings wie "Name <email@domain.com>".
 */
function extractEmail(address?: any) {
  if (!address) return '';
  const match = address.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return address.trim();
}

/**
 * Versendet eine E-Mail direkt über einen SMTP-Server via Sockets (Node.js net/tls).
 */
function sendSmtpMail(config?: any, mailOptions?: any) {
  return new Promise((resolve?: any, reject?: any) => {
    const host = config.host || 'localhost';
    const port = Number(config.port) || (config.secure ? 465 : 587);
    const secure = Boolean(config.secure);
    const requireTls = Boolean(config.requireTls);
    const ignoreTls = Boolean(config.ignoreTls);
    const rejectUnauthorized = config.rejectUnauthorized !== false;
    const timeout = Number(config.timeout) || 15000;

    const fromAddress = extractEmail(mailOptions.from || config.from || 'noreply@aquarium.local');
    const toAddress = extractEmail(mailOptions.to);

    if (!toAddress) {
      return reject(new Error('Kein Empfänger (to) angegeben.'));
    }

    const { mimeContent, messageId } = createMimeMessage({
      from: mailOptions.from || config.from || 'Aquarium-Logbuch <noreply@aquarium.local>',
      to: mailOptions.to,
      subject: mailOptions.subject || 'Benachrichtigung',
      html: mailOptions.html,
      text: mailOptions.text,
      messageIdDomain: host,
    });

    let socket: (net.Socket & { _currentLines?: string[] }) | null = null;
    let buffer = '';
    let state = 'INIT';
    let isTlsUpgraded = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (timer) clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners();
        socket.destroy();
      }
    }

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP Timeout (${timeout}ms) bei Verbindung zu ${host}:${port}`));
    }, timeout);

    function send(cmd?: any) {
      if (socket && !socket.destroyed) {
        socket.write(cmd + '\r\n');
      }
    }

    function onConnect() {
      state = 'CONNECTED';
    }

    function handleResponse(code?: any, message?: any, lines?: any) {
      // 220 Greeting
      if (state === 'CONNECTED' || (state === 'INIT' && code === 220)) {
        state = 'GREETING';
        send(`EHLO ${osHostname()}`);
        return;
      }

      // EHLO Antwort
      if (state === 'GREETING') {
        if (code === 250) {
          const supportsStarttls = lines.some((l: any) => l.toUpperCase().includes('STARTTLS'));
          const authLine = lines.find((l: any) => l.toUpperCase().includes('AUTH '));
          
          if (!secure && !isTlsUpgraded && supportsStarttls && !ignoreTls) {
            state = 'STARTTLS';
            send('STARTTLS');
            return;
          }

          proceedAuth(authLine);
          return;
        } else if (code === 500 || code === 502) {
          // Fallback zu HELO
          state = 'HELO';
          send(`HELO ${osHostname()}`);
          return;
        }
      }

      // HELO Antwort
      if (state === 'HELO') {
        if (code === 250) {
          proceedAuth(null);
          return;
        }
      }

      // STARTTLS Antwort
      if (state === 'STARTTLS') {
        if (code === 220) {
          state = 'UPGRADING_TLS';
          upgradeToTls();
          return;
        } else if (requireTls) {
          cleanup();
          return reject(new Error(`STARTTLS fehlgeschlagen: ${message}`));
        } else {
          // Ohne TLS fortfahren
          proceedAuth(null);
          return;
        }
      }

      // EHLO nach STARTTLS
      if (state === 'POST_STARTTLS_EHLO') {
        if (code === 250) {
          const authLine = lines.find((l: any) => l.toUpperCase().includes('AUTH '));
          proceedAuth(authLine);
          return;
        }
      }

      // AUTH LOGIN Ablauf
      if (state === 'AUTH_LOGIN') {
        if (code === 334) {
          state = 'AUTH_USER';
          send(Buffer.from(config.user || '').toString('base64'));
          return;
        }
      }

      if (state === 'AUTH_USER') {
        if (code === 334) {
          state = 'AUTH_PASS';
          send(Buffer.from(config.pass || '').toString('base64'));
          return;
        }
      }

      if (state === 'AUTH_PASS' || state === 'AUTH_PLAIN') {
        if (code === 235) {
          state = 'MAIL_FROM';
          send(`MAIL FROM:<${fromAddress}>`);
          return;
        } else {
          cleanup();
          return reject(new Error(`SMTP Authentifizierung fehlgeschlagen: ${message}`));
        }
      }

      // MAIL FROM
      if (state === 'MAIL_FROM') {
        if (code === 250) {
          state = 'RCPT_TO';
          send(`RCPT TO:<${toAddress}>`);
          return;
        }
      }

      // RCPT TO
      if (state === 'RCPT_TO') {
        if (code === 250 || code === 251) {
          state = 'DATA';
          send('DATA');
          return;
        }
      }

      // DATA Start
      if (state === 'DATA') {
        if (code === 354) {
          state = 'SENDING_CONTENT';
          // Dot-Stuffing für Daten
          const escapedContent = mimeContent.replace(/\r\n\./g, '\r\n..');
          send(`${escapedContent}\r\n.`);
          return;
        }
      }

      // DATA Beendet
      if (state === 'SENDING_CONTENT') {
        if (code === 250) {
          state = 'QUIT';
          send('QUIT');
          cleanup();
          return resolve({ ok: true, messageId: messageId, response: message });
        }
      }

      if (state === 'QUIT') {
        cleanup();
        return resolve({ ok: true, messageId: messageId, response: message });
      }

      // Unerwarteter Code / Fehler
      if (code >= 400) {
        cleanup();
        return reject(new Error(`SMTP Server-Fehler (${code}): ${message}`));
      }
    }

    function proceedAuth(authLine?: any) {
      if (config.user && config.pass) {
        const authStr = authLine ? authLine.toUpperCase() : 'AUTH LOGIN PLAIN';
        if (authStr.includes('PLAIN') && !authStr.includes('LOGIN')) {
          state = 'AUTH_PLAIN';
          const authData = Buffer.from(`\0${config.user}\0${config.pass}`).toString('base64');
          send(`AUTH PLAIN ${authData}`);
        } else {
          state = 'AUTH_LOGIN';
          send('AUTH LOGIN');
        }
      } else {
        state = 'MAIL_FROM';
        send(`MAIL FROM:<${fromAddress}>`);
      }
    }

    function upgradeToTls() {
      if (!socket) return;
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      
      const secureSocket = tls.connect({
        socket: socket,
        host: host,
        servername: host,
        rejectUnauthorized: rejectUnauthorized,
      });

      socket = secureSocket;
      isTlsUpgraded = true;
      attachSocketListeners();

      secureSocket.on('secureConnect', () => {
        state = 'POST_STARTTLS_EHLO';
        send(`EHLO ${osHostname()}`);
      });
    }

    function attachSocketListeners() {
      if (!socket) return;
      const activeSocket = socket;
      activeSocket.on('data', (chunk: any) => {
        buffer += chunk.toString('utf8');
        while (buffer.includes('\r\n')) {
          const idx = buffer.indexOf('\r\n');
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const match = line.match(/^(\d{3})([ -])(.*)$/);
          if (match) {
            const code = Number(match[1]);
            const isContinuation = match[2] === '-';
            const text = match[3];

            if (!activeSocket._currentLines) activeSocket._currentLines = [];
            activeSocket._currentLines.push(line);

            if (!isContinuation) {
              const fullLines = activeSocket._currentLines;
              activeSocket._currentLines = [];
              handleResponse(code, text, fullLines);
            }
          }
        }
      });

      activeSocket.on('error', (err: any) => {
        cleanup();
        reject(new Error(`SMTP Verbindungsfehler: ${err.message}`));
      });

      activeSocket.on('close', () => {
        if (state !== 'QUIT' && state !== 'SENDING_CONTENT') {
          // Unerwartetes Schließen vor Abschluss
          cleanup();
          reject(new Error('SMTP-Verbindung wurde vorzeitig vom Server geschlossen.'));
        }
      });
    }

    try {
      if (secure) {
        socket = tls.connect({
          host,
          port,
          servername: host,
          rejectUnauthorized: rejectUnauthorized,
        }, onConnect);
      } else {
        socket = net.createConnection({ host, port }, onConnect);
      }
      attachSocketListeners();
    } catch (caught: unknown) {
      const err = asError(caught);
      cleanup();
      reject(err);
    }
  });
}

function osHostname() {
  try {
    const os = require('os');
    return os.hostname() || 'localhost';
  } catch (e) {
    return 'localhost';
  }
}

export = {
  createMimeMessage,
  extractEmail,
  sendSmtpMail,
};
