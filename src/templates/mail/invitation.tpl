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
    .code-box {
      background-color: #f0fdfa;
      border: 2px dashed #0d9488;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin: 20px 0;
    }
    .code-value {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #0f766e;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
    }
    .alt-link-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin: 24px 0 12px;
      font-size: 13px;
      color: #64748b;
      word-break: break-all;
    }
    .alt-link {
      color: #0d9488;
      text-decoration: underline;
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
        <h1 class="header-title">{{brandTitle}}</h1>
        <p class="header-subtitle">Wasserwerte · Aquarien · Pflege</p>
      </div>
      <div class="content-body">
        <h2 class="headline">{{headline}}</h2>
        <p class="paragraph">Hallo,</p>
        <p class="paragraph">
          <strong>{{inviterName}}</strong> hat dich herzlich eingeladen, dem <strong>Aquarium-Logbuch</strong> beizutreten!
        </p>
        <p class="paragraph">
          Mit dem Aquarium-Logbuch behältst du Wasserwerte, Pflegemaßnahmen, Beckenfotos und Bewohner deiner Aquarien spielend leicht im Blick.
        </p>
        <div class="code-box">
          <div style="font-size: 12px; text-transform: uppercase; color: #0d9488; font-weight: 600; margin-bottom: 4px;">Dein Einladungscode:</div>
          <div class="code-value">{{inviteCode}}</div>
        </div>
        <div class="btn-container">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{inviteUrl}}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="18%" stroke="f" fillcolor="#0d9488">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">{{ctaText}}</center>
          </v:roundrect>
          <![endif]-->
          <a class="btn" href="{{inviteUrl}}" target="_blank" rel="noopener noreferrer">{{ctaText}}</a>
        </div>
        <div class="alt-link-box">
          Alternativ kannst du diesen Einladungslink direkt im Browser öffnen:<br>
          <a class="alt-link" href="{{inviteUrl}}" target="_blank" rel="noopener noreferrer">{{inviteUrl}}</a>
        </div>
        <div class="hint-box">
          Diese Einladung ist <strong>{{expiresDays}} Tage</strong> gültig{{expiresDateHint}}.<br>
          Falls du diese Einladung nicht erwartet hast, kannst du diese Nachricht einfach ignorieren.
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
