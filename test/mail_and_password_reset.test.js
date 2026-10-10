'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const { sendSmtpMail, createMimeMessage, extractEmail } = require('../src/utils/smtp');
const {
  renderBaseTemplate,
  createEmailVerificationMail,
  createPasswordResetMail,
  createTestEmailMail,
} = require('../src/services/mail-template');
const { MailService } = require('../src/services/mail-service');

/**
 * Erzeugt einen einfachen In-Memory Mock SMTP Server für Tests.
 */
function createMockSmtpServer() {
  const receivedMails = [];
  const server = net.createServer((socket) => {
    socket.write('220 localhost ESMTP MockServer\r\n');
    let inData = false;
    let dataBuffer = '';
    let authStep = 0;

    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (inData) {
        dataBuffer += text;
        if (dataBuffer.includes('\r\n.\r\n')) {
          inData = false;
          receivedMails.push(dataBuffer);
          dataBuffer = '';
          socket.write('250 2.0.0 OK: message queued\r\n');
        }
        return;
      }

      const lines = text.split('\r\n').filter(Boolean);
      for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-localhost Hello\r\n250-AUTH LOGIN PLAIN\r\n250 OK\r\n');
        } else if (upper.startsWith('AUTH LOGIN')) {
          authStep = 1;
          socket.write('334 VXNlcm5hbWU6\r\n'); // "Username:" base64
        } else if (authStep === 1) {
          authStep = 2;
          socket.write('334 UGFzc3dvcmQ6\r\n'); // "Password:" base64
        } else if (authStep === 2) {
          authStep = 0;
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 Ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          socket.write('250 2.1.5 Ok\r\n');
        } else if (upper.startsWith('DATA')) {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        getReceivedMails: () => receivedMails,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

test('Mail: SMTP Client, MIME Formatierung und Socket-Versand', async (t) => {
  const mockSmtp = await createMockSmtpServer();
  t.after(async () => await mockSmtp.close());

  // 1. MIME Message Erzeugung
  const { mimeContent, messageId } = createMimeMessage({
    from: 'Test <test@example.com>',
    to: 'empfaenger@example.com',
    subject: 'Wasserwerte Test 🐠',
    html: '<h1>Hallo Fischfreund</h1><p>Alles im grünen Bereich!</p>',
    text: 'Hallo Fischfreund\nAlles im grünen Bereich!',
  });

  assert.ok(messageId);
  assert.ok(mimeContent.includes('From: Test <test@example.com>'));
  assert.ok(mimeContent.includes('To: empfaenger@example.com'));
  assert.ok(mimeContent.includes('Subject: =?UTF-8?B?'));
  assert.ok(mimeContent.includes('Content-Type: multipart/alternative; boundary='));

  // 2. Extraktion von E-Mail-Adressen
  assert.strictEqual(extractEmail('"Max Mustermann" <max@example.com>'), 'max@example.com');
  assert.strictEqual(extractEmail('plain@example.com'), 'plain@example.com');

  // 3. Echter Socket-Versand an den Mock-Server
  const sendRes = await sendSmtpMail(
    {
      host: '127.0.0.1',
      port: mockSmtp.port,
      secure: false,
      ignoreTls: true,
      user: 'testuser',
      pass: 'testpass',
      from: 'sender@example.com',
    },
    {
      to: 'target@example.com',
      subject: 'Prüfbericht Aquarium',
      html: '<p>pH: 7.2, Temp: 25°C</p>',
      text: 'pH: 7.2, Temp: 25°C',
    }
  );

  assert.strictEqual(sendRes.ok, true);
  assert.ok(sendRes.messageId);

  const received = mockSmtp.getReceivedMails();
  assert.strictEqual(received.length, 1);
  assert.ok(received[0].includes('To: target@example.com'));
});

test('Mail: HTML- und Plain-Text Templates', async () => {
  // 1. Base Template
  const baseHtml = renderBaseTemplate({
    title: 'Test Titel',
    headline: 'Wichtige Mitteilung',
    contentHtml: '<p>Inhalt hier</p>',
    ctaText: 'Aktion ausführen',
    ctaUrl: 'https://example.com/action',
  });
  assert.ok(baseHtml.includes('🐠 Aquarium-Logbuch'));
  assert.ok(baseHtml.includes('Aktion ausführen'));
  assert.ok(baseHtml.includes('https://example.com/action'));

  // 2. Verification Mail Template
  const verifyMail = createEmailVerificationMail({
    username: 'Aquarist123',
    verifyUrl: 'https://aquarium.local/#/verify-email?token=xyz123',
    expiresHours: 24,
  });
  assert.ok(verifyMail.subject.includes('E-Mail-Adresse für Aquarium-Logbuch'));
  assert.ok(verifyMail.html.includes('Aquarist123'));
  assert.ok(verifyMail.html.includes('https://aquarium.local/#/verify-email?token=xyz123'));
  assert.ok(verifyMail.text.includes('24 Stunden'));

  // 3. Password Reset Template
  const resetMail = createPasswordResetMail({
    username: 'Aquarist123',
    resetUrl: 'https://aquarium.local/#/reset-password?token=secret456',
    expiresMinutes: 60,
  });
  assert.ok(resetMail.subject.includes('Passwort zurücksetzen'));
  assert.ok(resetMail.html.includes('Aquarist123'));
  assert.ok(resetMail.html.includes('https://aquarium.local/#/reset-password?token=secret456'));
  assert.ok(resetMail.text.includes('60 Minuten'));

  // 4. Test Email Template
  const testMail = createTestEmailMail({
    adminUsername: 'SuperAdmin',
    serverInfo: 'mail.host.de:587 (STARTTLS)',
  });
  assert.ok(testMail.subject.includes('Test-E-Mail'));
  assert.ok(testMail.html.includes('SuperAdmin'));
  assert.ok(testMail.html.includes('mail.host.de:587'));
});

test('Mail: MailService Warteschlange und Rate-Limiting', async (t) => {
  const mockSmtp = await createMockSmtpServer();
  t.after(async () => await mockSmtp.close());

  const service = new MailService();
  service.saveConfig({
    enabled: true,
    host: '127.0.0.1',
    port: mockSmtp.port,
    ignoreTls: true,
    rateLimitMs: 50, // Schnell für Tests
  });

  // 3 E-Mails in die Warteschlange stellen
  service.enqueueMail({ to: 'user1@example.com', subject: 'Mail 1', text: 'Text 1' });
  service.enqueueMail({ to: 'user2@example.com', subject: 'Mail 2', text: 'Text 2' });
  service.enqueueMail({ to: 'user3@example.com', subject: 'Mail 3', text: 'Text 3' });

  // Warte bis Queue abgearbeitet ist
  for (let i = 0; i < 20; i++) {
    if (service.getQueueStatus().sentCount >= 3) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  const status = service.getQueueStatus();
  assert.strictEqual(status.sentCount, 3);
  assert.strictEqual(status.failedCount, 0);
  assert.strictEqual(status.queueLength, 0);
  assert.ok(status.lastSentAt);

  const received = mockSmtp.getReceivedMails();
  assert.strictEqual(received.length, 3);
});

test('Auth: E-Mail-Verifizierung Workflow', async (t) => {
  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@aquarium.test',
  });
  t.after(async () => await env.cleanup());
  const db = require('../src/db');

  // 1. Neuer regulärer Benutzer registriert sich
  const regRes = await env.request('/api/register', {
    method: 'POST',
    body: {
      username: 'frischer_benutzer',
      password: 'sicheresPasswort123',
      email: 'frisch@aquarium.test',
    },
  });
  assert.strictEqual(regRes.status, 200);
  assert.strictEqual(regRes.data.needsVerification, true);
  assert.strictEqual(regRes.cookies.session, undefined, 'Kein Login vor Verifizierung');

  // 2. Versuch sich unbestätigt einzuloggen -> 403 Forbidden mit unverified: true
  const loginUnverified = await env.request('/api/login', {
    method: 'POST',
    body: {
      username: 'frischer_benutzer',
      password: 'sicheresPasswort123',
    },
  });
  assert.strictEqual(loginUnverified.status, 403);
  assert.strictEqual(loginUnverified.data.unverified, true);
  assert.strictEqual(loginUnverified.data.email, 'frisch@aquarium.test');

  // 3. Verifizierungstoken aus Datenbank holen
  const userInDb = await db.users.findByUsername('frischer_benutzer');
  assert.ok(userInDb.email_verify_token);
  assert.strictEqual(userInDb.email_verified, 0);
  assert.ok(userInDb.email_verify_expires > Date.now());

  // 4. Verifizierung mit ungültigem Token schlägt fehl (400)
  const invalidVerify = await env.request('/api/verify-email', {
    method: 'POST',
    body: { token: 'falscher_token_123' },
  });
  assert.strictEqual(invalidVerify.status, 400);

  // 5. Erfolgreiche Verifizierung
  const okVerify = await env.request('/api/verify-email', {
    method: 'POST',
    body: { token: userInDb.email_verify_token },
  });
  assert.strictEqual(okVerify.status, 200);
  assert.ok(okVerify.data.ok);

  // Benutzerstatus in DB prüfen
  const verifiedUser = await db.users.findByUsername('frischer_benutzer');
  assert.strictEqual(verifiedUser.email_verified, 1);
  assert.strictEqual(verifiedUser.email_verify_token, null);

  // 6. Login nach Verifizierung erfolgreich
  const loginOk = await env.request('/api/login', {
    method: 'POST',
    body: {
      username: 'frischer_benutzer',
      password: 'sicheresPasswort123',
    },
  });
  assert.strictEqual(loginOk.status, 200);
  assert.strictEqual(loginOk.data.username, 'frischer_benutzer');
  assert.ok(loginOk.cookies.session);

  // 7. Admin-Registrierung ist sofort verifiziert (keine Bestätigungs-Mail notwendig)
  const adminReg = await env.request('/api/register', {
    method: 'POST',
    body: {
      username: 'admin_chief',
      password: 'adminpassword123',
      email: 'admin@aquarium.test',
    },
  });
  assert.strictEqual(adminReg.status, 200);
  assert.strictEqual(adminReg.data.needsVerification, false);
  assert.ok(adminReg.cookies.session);

  const adminInDb = await db.users.findByUsername('admin_chief');
  assert.strictEqual(adminInDb.email_verified, 1);
});

test('Auth: Passwort-Reset Workflow und Token-Ablauf', async (t) => {
  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@aquarium.test',
  });
  t.after(async () => await env.cleanup());
  const db = require('../src/db');

  const user = await env.createUserAndLogin('reset_target', 'originalpassword123', 'reset@aquarium.test');

  // 1. Passwort vergessen Anfrage stellen
  const forgotRes = await env.request('/api/forgot-password', {
    method: 'POST',
    body: { identifier: 'reset@aquarium.test' },
  });
  assert.strictEqual(forgotRes.status, 200);
  assert.ok(forgotRes.data.ok);

  // Token in DB ermitteln
  const uDb = await db.users.findByUsername('reset_target');
  assert.ok(uDb.password_reset_token);
  assert.ok(uDb.password_reset_expires > Date.now());

  // 2. Reset mit zu kurzem Passwort
  const shortReset = await env.request('/api/reset-password', {
    method: 'POST',
    body: {
      token: uDb.password_reset_token,
      password: 'short',
    },
  });
  assert.strictEqual(shortReset.status, 400);

  // 3. Reset mit ungültigem Token
  const badTokenReset = await env.request('/api/reset-password', {
    method: 'POST',
    body: {
      token: 'falscher-token-999',
      password: 'neuesSicheresPasswort123',
    },
  });
  assert.strictEqual(badTokenReset.status, 400);

  // 4. Erfolgreiches Zurücksetzen
  const resetOk = await env.request('/api/reset-password', {
    method: 'POST',
    body: {
      token: uDb.password_reset_token,
      password: 'neuesSicheresPasswort123',
    },
  });
  assert.strictEqual(resetOk.status, 200);
  assert.ok(resetOk.data.ok);

  // 5. Altes Passwort funktioniert nicht mehr
  const oldLogin = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'reset_target', password: 'originalpassword123' },
  });
  assert.strictEqual(oldLogin.status, 401);

  // 6. Neues Passwort funktioniert
  const newLogin = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'reset_target', password: 'neuesSicheresPasswort123' },
  });
  assert.strictEqual(newLogin.status, 200);
  assert.ok(newLogin.cookies.session);

  // 7. Altes Session-Cookie wurde invalidiert
  const meWithOldCookie = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(meWithOldCookie.status, 401);
});

test('Admin: E-Mail- & SMTP-Konfiguration und Test-Mail', async (t) => {
  const mockSmtp = await createMockSmtpServer();
  t.after(async () => await mockSmtp.close());

  const env = createTestEnvironment({
    ADMIN_EMAIL: 'admin@aquarium.test',
  });
  t.after(async () => await env.cleanup());

  const regularUser = await env.createUserAndLogin('reg_user', 'password123', 'reg@aquarium.test');
  const adminUser = await env.createUserAndLogin('admin_user', 'password123', 'admin@aquarium.test');

  // 1. Nicht-Admin wird bei Mail-Konfiguration abgewiesen (403)
  const forbiddenMailGet = await env.request('/api/admin/mail', { headers: { Cookie: regularUser.cookie } });
  assert.strictEqual(forbiddenMailGet.status, 403);

  const forbiddenMailPut = await env.request('/api/admin/mail', {
    method: 'PUT',
    headers: { Cookie: regularUser.cookie },
    body: { enabled: true },
  });
  assert.strictEqual(forbiddenMailPut.status, 403);

  // 2. Admin ruft Mail-Konfiguration ab (Passwort maskiert)
  const mailGet = await env.request('/api/admin/mail', { headers: { Cookie: adminUser.cookie } });
  assert.strictEqual(mailGet.status, 200);
  assert.ok(mailGet.data.config);
  assert.ok(mailGet.data.queue);
  assert.strictEqual(typeof mailGet.data.config.hasPassword, 'boolean');

  // 3. Admin speichert neue SMTP-Einstellungen
  const mailPut = await env.request('/api/admin/mail', {
    method: 'PUT',
    headers: { Cookie: adminUser.cookie },
    body: {
      enabled: true,
      host: '127.0.0.1',
      port: mockSmtp.port,
      ignoreTls: true,
      user: 'admin_smtp_user',
      pass: 'admin_smtp_pass',
      from: '"Aquarium Admin" <admin@aquarium.test>',
      rateLimitMs: 200,
    },
  });
  assert.strictEqual(mailPut.status, 200);
  assert.strictEqual(mailPut.data.config.enabled, true);
  assert.strictEqual(mailPut.data.config.host, '127.0.0.1');
  assert.strictEqual(mailPut.data.config.port, mockSmtp.port);
  assert.strictEqual(mailPut.data.config.hasPassword, true);

  // 4. Admin sendet Test-E-Mail
  const testMailRes = await env.request('/api/admin/mail/test', {
    method: 'POST',
    headers: { Cookie: adminUser.cookie },
    body: { to: 'testempfaenger@aquarium.test' },
  });
  assert.strictEqual(testMailRes.status, 200);
  assert.ok(testMailRes.data.ok);

  const mails = mockSmtp.getReceivedMails();
  assert.strictEqual(mails.length, 1);
  assert.ok(mails[0].includes('To: testempfaenger@aquarium.test'));

  // 5. Admin-Benutzerliste enthält emailVerified
  const userList = await env.request('/api/admin/users', { headers: { Cookie: adminUser.cookie } });
  assert.strictEqual(userList.status, 200);
  const regInList = userList.data.find((u) => u.id === regularUser.id);
  assert.ok(regInList);
  assert.strictEqual(regInList.emailVerified, true);
});

test('MongoDB: E-Mail-Verifizierung und Passwort-Reset Parität', async (t) => {
  const env = await createMongoTestEnvironment({
    ADMIN_EMAIL: 'mongo_admin@aquarium.test',
  });
  t.after(async () => await env.cleanup());
  const db = require('../src/db');

  // Registrierung & Verifizierung unter MongoDB
  const reg = await env.request('/api/register', {
    method: 'POST',
    body: {
      username: 'mongo_user',
      password: 'password12345',
      email: 'mongo_user@aquarium.test',
    },
  });
  assert.strictEqual(reg.status, 200);
  assert.strictEqual(reg.data.needsVerification, true);

  // Token abfragen
  const user = await db.users.findByUsername('mongo_user');
  assert.ok(user.email_verify_token);
  assert.strictEqual(user.email_verified, 0);

  // Verifizieren
  const ver = await env.request('/api/verify-email', {
    method: 'POST',
    body: { token: user.email_verify_token },
  });
  assert.strictEqual(ver.status, 200);

  // Login
  const login = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'mongo_user', password: 'password12345' },
  });
  assert.strictEqual(login.status, 200);
  assert.ok(login.cookies.session);

  // Passwort-Reset Flow unter MongoDB
  await env.request('/api/forgot-password', {
    method: 'POST',
    body: { identifier: 'mongo_user' },
  });

  const updatedUser = await db.users.findByUsername('mongo_user');
  assert.ok(updatedUser.password_reset_token);

  const reset = await env.request('/api/reset-password', {
    method: 'POST',
    body: { token: updatedUser.password_reset_token, password: 'new_mongo_password_999' },
  });
  assert.strictEqual(reset.status, 200);

  const loginNew = await env.request('/api/login', {
    method: 'POST',
    body: { username: 'mongo_user', password: 'new_mongo_password_999' },
  });
  assert.strictEqual(loginNew.status, 200);
});
