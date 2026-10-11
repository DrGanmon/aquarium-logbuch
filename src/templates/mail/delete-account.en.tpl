<!DOCTYPE html>
<html lang="en">
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
      background-color: #fef2f2;
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
      background-color: #fef2f2;
      padding: 32px 12px;
    }
    .main-card {
      background-color: #ffffff;
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-radius: 16px;
      border: 1px solid #fee2e2;
      box-shadow: 0 10px 25px -5px rgba(220, 38, 38, 0.08), 0 8px 10px -6px rgba(220, 38, 38, 0.04);
      overflow: hidden;
    }
    .header-bar {
      background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
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
      color: #fecaca;
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
      color: #991b1b;
      font-size: 20px;
      font-weight: 700;
      line-height: 1.35;
    }
    .paragraph {
      margin: 0 0 16px;
      color: #334155;
      font-size: 15px;
      line-height: 1.6;
    }
    .warning-box {
      background-color: #fff1f2;
      border-left: 4px solid #e11d48;
      border-radius: 6px;
      padding: 14px 16px;
      margin: 20px 0;
    }
    .warning-title {
      margin: 0 0 6px;
      color: #9f1239;
      font-weight: 700;
      font-size: 14px;
    }
    .warning-list {
      margin: 0;
      padding-left: 20px;
      color: #881337;
      font-size: 13px;
      line-height: 1.5;
    }
    .btn-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35);
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
      color: #dc2626;
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
        <div style="margin-bottom: 12px; text-align: center;">
          <img src="{{logoUrl}}" alt="Logo" width="48" height="48" style="width: 48px; height: 48px; border-radius: 10px; display: inline-block; vertical-align: middle; border: 0; outline: none; text-decoration: none; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);">
        </div>
        <h1 class="header-title">{{brandTitle}}</h1>
        <p class="header-subtitle">Account Management · Security</p>
      </div>
      <div class="content-body">
        <h2 class="headline">{{headline}}</h2>
        <p class="paragraph">Hello <strong>{{username}}</strong>,</p>
        <p class="paragraph">
          You requested the permanent deletion of your user account <strong>{{username}}</strong> in the profile settings of Aquarium Logbook.
        </p>

        <div class="warning-box">
          <p class="warning-title">⚠️ Important: This action is permanent and cannot be undone!</p>
          <ul class="warning-list">
            <li>Your user account will be permanently deleted.</li>
            <li>All your aquariums, tank photos, and notes will be removed.</li>
            <li>All recorded water parameters, logs, and maintenance tasks will be lost.</li>
            <li>All shared aquariums and active login sessions will be terminated immediately.</li>
          </ul>
        </div>

        <p class="paragraph">
          If you really want to permanently delete your account and all associated data, click the button below:
        </p>

        <div class="btn-container">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{deleteUrl}}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="18%" stroke="f" fillcolor="#dc2626">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">{{ctaText}}</center>
          </v:roundrect>
          <![endif]-->
          <a class="btn" href="{{deleteUrl}}" target="_blank" rel="noopener noreferrer">{{ctaText}}</a>
        </div>

        <div class="alt-link-box">
          If the button does not work, open this link directly in your browser:<br>
          <a class="alt-link" href="{{deleteUrl}}" target="_blank" rel="noopener noreferrer">{{deleteUrl}}</a>
        </div>

        <div class="hint-box">
          This confirmation link is valid for <strong>{{expiresMinutes}} minutes</strong>.<br>
          If you do NOT want to delete your account, simply ignore this email. Your account and data will remain safe and unchanged.
        </div>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px;">{{footerNote}}</p>
      <p style="margin: 0;">© {{currentYear}} Aquarium Logbook</p>
    </div>
  </div>
</body>
</html>
