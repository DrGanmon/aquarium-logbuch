<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{title}}</title>
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #f0fdfa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f0fdfa;
      padding: 32px 12px;
    }
    .main-card {
      background-color: #ffffff;
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-radius: 16px;
      border: 1px solid #ccfbf1;
      box-shadow: 0 10px 25px -5px rgba(15, 118, 110, 0.08), 0 8px 10px -6px rgba(15, 118, 110, 0.04);
      overflow: hidden;
    }
    .header-bar {
      background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
      padding: 28px 32px;
      text-align: center;
    }
    .header-title {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .header-subtitle {
      margin: 6px 0 0;
      color: #ccfbf1;
      font-size: 13px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .content-body {
      padding: 32px;
    }
    .headline {
      margin: 0 0 16px;
      color: #0f172a;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
    }
    .paragraph {
      margin: 0 0 16px;
      color: #334155;
      font-size: 15px;
      line-height: 1.6;
    }
    .info-card {
      background-color: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .btn-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      padding: 14px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
    }
    .link-fallback {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      word-break: break-all;
      color: #64748b;
      margin-top: 20px;
    }
    .link-fallback a {
      color: #0f766e;
      text-decoration: underline;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #f1f5f9;
      padding: 20px 32px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main-card">
      <div class="header-bar">
        <div style="margin-bottom: 12px; text-align: center;">
          <img src="{{logoUrl}}" alt="Logo" width="48" height="48" style="width: 48px; height: 48px; border-radius: 10px; display: inline-block; vertical-align: middle; border: 0; outline: none; text-decoration: none; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);">
        </div>
        <h1 class="header-title">{{brandTitle}}</h1>
        <p class="header-subtitle">Erinnerung · Pflanzennährstoffe · Düngzyklus</p>
      </div>

      <div class="content-body">
        <h2 class="headline">{{headline}}</h2>
        <p class="paragraph">Hallo <strong>{{username}}</strong>,</p>
        <p class="paragraph">
          für dein Aquarium <strong>„{{aquariumName}}“</strong> steht gemäß deinem hinterlegten Düngzyklus eine neue Pflanzendüngung an!
        </p>

        <div class="info-card">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 6px 0; color: #0f766e; font-weight: 600; font-size: 14px;">🐠 Aquarium:</td>
              <td style="padding: 6px 0; text-align: right; color: #0f172a; font-weight: 600; font-size: 14px;">{{aquariumName}}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #0f766e; font-weight: 600; font-size: 14px;">🌿 Düngzyklus:</td>
              <td style="padding: 6px 0; text-align: right; color: #0f172a; font-weight: 500; font-size: 14px;">{{cycleLabel}}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #0f766e; font-weight: 600; font-size: 14px;">🕒 Status:</td>
              <td style="padding: 6px 0; text-align: right; color: #b91c1c; font-weight: 600; font-size: 14px;">{{statusLabel}}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #0f766e; font-weight: 600; font-size: 14px;">📅 Letzte Düngung:</td>
              <td style="padding: 6px 0; text-align: right; color: #0f172a; font-weight: 500; font-size: 14px;">{{lastDateStr}}</td>
            </tr>
          </table>
        </div>

        <p class="paragraph">
          Eine gleichmäßige Nährstoffversorgung beugt Algen vor und sorgt für kräftiges, gesundes Pflanzenwachstum.
        </p>

        <div class="btn-container">
          <a href="{{fertilizeUrl}}" class="btn" target="_blank">{{ctaText}}</a>
        </div>

        <div class="link-fallback">
          Falls der Button nicht funktioniert, öffne diesen Link im Browser:<br>
          <a href="{{fertilizeUrl}}">{{fertilizeUrl}}</a>
        </div>
      </div>

      <div class="footer">
        {{footerNote}}<br>
        &copy; {{currentYear}} Aquarium-Logbuch. Alle Rechte vorbehalten.
      </div>
    </div>
  </div>
</body>
</html>
