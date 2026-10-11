<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{title}}</title>
  <style>
    /* Reset & Base */
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
    .status-card {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 14px 18px;
      margin: 16px 0;
    }
    .status-title {
      margin: 0 0 6px;
      color: #166534;
      font-weight: 600;
    }
    .status-content {
      margin: 0;
      font-size: 13px;
      color: #15803d;
      line-height: 1.5;
    }
    .hint-box {
      border-top: 1px solid #f1f5f9;
      margin-top: 24px;
      padding-top: 16px;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer {
      text-align: center;
      padding: 24px 12px 8px;
      font-size: 12px;
      color: #64748b;
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      mso-hide: all;
      font-size: 1px;
      line-height: 1px;
      max-height: 0;
      max-width: 0;
      opacity: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="preheader">{{preheader}}</div>
  <div class="wrapper">
    <div class="main-card">
      <div class="header-bar">
        <div style="margin-bottom: 12px; text-align: center;">
          <img src="{{logoUrl}}" alt="Logo" width="48" height="48" style="width: 48px; height: 48px; border-radius: 10px; display: inline-block; vertical-align: middle; border: 0; outline: none; text-decoration: none; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);">
        </div>
        <h1 class="header-title">{{brandTitle}}</h1>
        <p class="header-subtitle">Wasserwerte · Aquarien · Pflege</p>
      </div>
      <div class="content-body">
        <h2 class="headline">{{headline}}</h2>
        <p class="paragraph">Hallo <strong>{{adminUsername}}</strong>,</p>
        <p class="paragraph">
          herzlichen Glückwunsch! Die E-Mail- und SMTP-Server-Konfiguration deines <strong>Aquarium-Logbuchs</strong> wurde erfolgreich getestet und ist betriebsbereit.
        </p>
        <div class="status-card">
          <p class="status-title">Systemstatus:</p>
          <p class="status-content">
            • Zeitpunkt: {{dateStr}}<br>
            • SMTP-Server: {{serverInfo}}<br>
            • Mail-Warteschlange: Aktiviert
          </p>
        </div>
        <div class="hint-box">
          Diese Nachricht wurde über die Admin-Oberfläche zur Überprüfung der Mail-Zustellung versendet.
        </div>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px;">{{footerNote}}</p>
      <p style="margin: 0;">© {{currentYear}} Aquarium-Logbuch</p>
    </div>
  </div>
</body>
</html>
