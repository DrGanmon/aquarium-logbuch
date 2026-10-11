'use strict';

import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { ME, $topbar } from '../state.js';
import { getThemeSetting, toggleTheme } from '../theme.js';
import { showAuth } from './auth.js';
import { updateTopbarUser } from '../router.js';

export async function viewLegal(requestedTab = 'impressum') {
  let activeTab = requestedTab || 'impressum';
  if (activeTab === 'imprint') activeTab = 'impressum';
  if (activeTab === 'privacy') activeTab = 'datenschutz';
  if (activeTab === 'licenses' || activeTab === 'copyright') activeTab = 'licenses';
  if (activeTab === 'contact') activeTab = 'kontakt';

  $topbar.hidden = !ME;
  if (ME) updateTopbarUser();

  let legalInfo = { contactEmail: 'dr@ganmon.org', imprintEmail: 'dr@ganmon.org' };
  try {
    const data = await api('/legal-info');
    if (data) legalInfo = data;
  } catch (e) {
    // Fallback auf Standardwerte
  }
  const contactMail = legalInfo.contactEmail || 'dr@ganmon.org';
  const imprintMail = legalInfo.imprintEmail || contactMail;

  const currentTheme = getThemeSetting();
  const themeAuthIcon = currentTheme === 'system' ? '🌓' : (currentTheme === 'dark' ? '🌙' : '☀️');
  const themeAuthLabel = currentTheme === 'system' ? 'System' : (currentTheme === 'dark' ? 'Dunkel' : 'Hell');
  const themeAuthBtn = !ME
    ? h(
        'button',
        {
          class: 'btn small ghost',
          type: 'button',
          title: `Farbschema: ${themeAuthLabel} (klicken zum Umschalten)`,
          onclick: () => {
            toggleTheme();
            const nextTheme = getThemeSetting();
            themeAuthBtn.textContent =
              nextTheme === 'system' ? '🌓 System' : nextTheme === 'dark' ? '🌙 Dunkel' : '☀️ Hell';
          },
        },
        `${themeAuthIcon} ${themeAuthLabel}`
      )
    : null;

  const backLink = ME
    ? h('a', { class: 'btn ghost small', href: '#/' }, '← Zurück zur Übersicht')
    : h(
        'a',
        {
          class: 'btn ghost small',
          href: '#/',
          onclick: (e) => {
            e.preventDefault();
            location.hash = '#/';
            showAuth('login');
          },
        },
        '← Zurück zur Anmeldung'
      );

  const topNavRow = h(
    'div',
    { class: 'row between', style: 'margin-bottom:1rem; align-items:center;' },
    backLink,
    !ME
      ? h(
          'div',
          { style: 'display:flex; align-items:center; gap:.5rem;' },
          h('img', {
            src: 'favicon-32x32.png',
            alt: 'Logo',
            style: 'width:24px; height:24px; border-radius:6px;',
          }),
          h('span', { class: 'muted', style: 'font-weight:600;' }, 'Aquarium-Logbuch'),
          themeAuthBtn
        )
      : null
  );

  const tabs = [
    { id: 'impressum', hash: '#/impressum', label: '⚖️ Impressum & KI-Hinweis' },
    { id: 'datenschutz', hash: '#/datenschutz', label: '🔒 Datenschutz' },
    { id: 'licenses', hash: '#/lizenzen', label: '📜 Lizenzen & Copyright' },
    { id: 'kontakt', hash: '#/kontakt', label: '✉️ Kontakt' },
  ];

  const tabsBar = h(
    'div',
    { class: 'legal-tabs', role: 'tablist' },
    ...tabs.map((t) =>
      h(
        'a',
        {
          class: `legal-tab ${activeTab === t.id ? 'active' : ''}`,
          href: t.hash,
          role: 'tab',
          'aria-selected': activeTab === t.id ? 'true' : 'false',
        },
        t.label
      )
    )
  );

  let contentNode = null;

  if (activeTab === 'impressum') {
    contentNode = h(
      'div',
      { class: 'legal-box stack' },
      h('h1', {}, '⚖️ Impressum & Rechtliche Hinweise'),

      h(
        'div',
        { class: 'legal-badge-box stack', style: 'gap:.4rem;' },
        h(
          'h3',
          {
            style:
              'margin:0; display:flex; align-items:center; gap:.4rem; color:var(--ink);',
          },
          '🤖 Transparenzpflicht nach Art. 50 EU AI Act (Verordnung (EU) 2024/1689)'
        ),
        h(
          'p',
          { style: 'margin:0; font-size:.93rem;' },
          'Dieses Softwaresystem (Aquarium-Logbuch) wurde unter Einsatz generativer Künstlicher Intelligenz (JetBrains Junie / KI-Programmierassistenten) konzipiert, programmiert und strukturiert. Der Programmcode, die Datenbankadapter, Frontend-Ansichten sowie Hilfstexte wurden KI-gestützt generiert und qualitätsgesichert.'
        ),
        h(
          'p',
          { style: 'margin:0; font-size:.9rem; color:var(--ink-soft);' },
          'Wichtiger Fachhinweis: Die in der App hinterlegten Wasserwertgrenzen, Richtwerte, Alarme, Pflegeregeln und Artendaten dienen der privaten aquaristischen Orientierung. Sie stellen keine tiermedizinische oder biologisch-chemische Fachberatung dar.'
        )
      ),

      h('h2', {}, '1. Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)'),
      h(
        'p',
        {},
        'Aquarium-Logbuch – Webanwendung zur Verwaltung und Protokollierung von Aquarien, Wasserwerten und Pflegemaßnahmen.',
        h('br'),
        h('strong', {}, 'Diensteanbieter / Betreiber:'),
        ' Betreiber der jeweiligen Server-Instanz / Administrator',
        h('br'),
        h('strong', {}, 'Kontakt-E-Mail (Impressum):'),
        ' ',
        h('a', { href: `mailto:${imprintMail}` }, imprintMail),
        h('br'),
        h('strong', {}, 'Hosting:'),
        ' Eigenbetriebene Instanz (Self-Hosted / On-Premises)'
      ),

      h('h2', {}, '2. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV'),
      h(
        'p',
        {},
        'Verantwortlich für redaktionelle Inhalte ist der jeweilige Betreiber bzw. Administrator dieser Anwendungsinstanz.'
      ),

      h('h2', {}, '3. Haftung für Inhalte und Links'),
      h(
        'p',
        {},
        'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen ständig zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.'
      ),
      h(
        'p',
        {},
        'Diese Anwendung enthält ggf. Links zu externen Websites Dritter, auf deren Inhalte kein Einfluss besteht. Deshalb kann für diese fremden Inhalte auch keine Gewähr übernommen werden. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.'
      ),

      h('h2', {}, '4. EU-Streitschlichtung & Verbraucherstreitbeilegung'),
      h(
        'p',
        {},
        'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: ',
        h(
          'a',
          {
            href: 'https://ec.europa.eu/consumers/odr/',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'https://ec.europa.eu/consumers/odr/'
        ),
        h('br'),
        'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle im Sinne des Verbraucherstreitbeilegungsgesetzes (VSBG) teilzunehmen.'
      )
    );
  } else if (activeTab === 'datenschutz') {
    contentNode = h(
      'div',
      { class: 'legal-box stack' },
      h('h1', {}, '🔒 Datenschutzerklärung'),
      h(
        'p',
        { class: 'muted', style: 'margin:0;' },
        'Informationen über die Verarbeitung personenbezogener Daten nach Art. 12, 13, 14 und 21 der Datenschutz-Grundverordnung (DSGVO).'
      ),

      h('h2', {}, '1. Verantwortliche Stelle'),
      h(
        'p',
        {},
        'Verantwortlich für die Datenverarbeitung im Sinne der DSGVO ist der Administrator bzw. Betreiber dieser Serverinstanz.',
        h('br'),
        'Kontakt: ',
        h('a', { href: `mailto:${contactMail}` }, contactMail)
      ),

      h('h2', {}, '2. Erhobene Datenarten und Verarbeitungszwecke'),
      h(
        'ul',
        { style: 'padding-left:1.2rem; margin:.4rem 0;' },
        h(
          'li',
          {},
          h('strong', {}, 'Benutzerkonto & Registrierung (Art. 6 Abs. 1 lit. b DSGVO): '),
          'Bei der Registrierung werden Benutzername, E-Mail-Adresse und ein kryptografischer Passwort-Hash gespeichert. Die E-Mail-Adresse dient der Kontoaktivierung, Passwort-Wiederherstellung und sicherheitsrelevanten Benachrichtigungen.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Aquariendaten, Messwerte & Fotos (Art. 6 Abs. 1 lit. b DSGVO): '),
          'Die von Ihnen eingegebenen Daten (Aquariennamen, Abmessungen, Wasserparameter, Pflegemaßnahmen, Besatzlisten und hochgeladenen Bilder) werden zur Bereitstellung der Protokollierungs- und Auswertungsfunktionen in der Datenbank gespeichert.'
        ),
        h(
          'li',
          {},
          h(
            'strong',
            {},
            'Sitzungs-Cookies & Lokaler Speicher (Art. 6 Abs. 1 lit. f DSGVO / § 25 Abs. 2 TDDDG): '
          ),
          'Zur Benutzerauthentifizierung wird ein technisch zwingend erforderliches, verschlüsseltes Session-Cookie (',
          h('code', {}, 'aquarium_session'),
          ', HttpOnly, SameSite=Lax) verwendet. Lokale Anzeigeeinstellungen (z. B. Dark Mode oder Filtereinstellungen) werden lokal im Browser (localStorage) abgelegt. Es werden keine Werbe- oder Tracking-Cookies eingesetzt.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'E-Mail-Versand (Art. 6 Abs. 1 lit. b & f DSGVO): '),
          'Für Systembenachrichtigungen (Verifizierungslinks, Passwort-Reset, Freigabe-Einladungen, konfigurierte Mess-/Düngungserinnerungen) werden E-Mails über den hinterlegten SMTP-Server versendet.'
        ),
        h(
          'li',
          {},
          h(
            'strong',
            {},
            'KI-Chat-Assistent & Sprachmodelle (Art. 6 Abs. 1 lit. a & b DSGVO): '
          ),
          'Die Nutzung des KI-Aquarium-Assistenten ist vollständig freiwillig („Bring Your Own Key“). Wenn Sie im Profil einen persönlichen API-Schlüssel für OpenAI (ChatGPT), Google Gemini oder Anthropic Claude hinterlegen und eine Chat-Anfrage absenden, werden die Stammdaten des Aquariums (Name, Volumen, Abmessungen, Technik, Bodengrund), der Besatz (Pflanzen- und Tierarten) sowie die letzten bis zu 10 Messungen als Kontext an den jeweiligen Anbieter übermittelt, um fachbezogene Antworten zu generieren. API-Schlüssel werden sicher in der Datenbank gespeichert, im Frontend nur maskiert angezeigt und können im Benutzerprofil jederzeit restlos gelöscht werden.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Server-Logdateien (Art. 6 Abs. 1 lit. f DSGVO): '),
          'Beim Zugriff werden technische Serverprotokolle (IP-Adresse, Zeitstempel, HTTP-Status, Fehlermeldungen) erfasst, um die Funktionsfähigkeit, Verfügbarkeit und Sicherheit der Anwendung zu gewährleisten.'
        )
      ),

      h(
        'h2',
        {},
        '3. Lokale Verarbeitung, Keine externen Tracker & Externe Dienste'
      ),
      h(
        'p',
        {},
        'Diese Anwendung ist für den autarken Eigenbetrieb (Self-Hosting) konzipiert. Es findet keinerlei Tracking oder Weitergabe personenbezogener Daten an Dritte oder Werbenetzwerke statt. Alle Bibliotheken (einschließlich Chart.js) und Schriftarten werden lokal vom Server geladen – es bestehen keine externen Abhängigkeiten von Drittanbieter-CDNs.'
      ),
      h(
        'p',
        {},
        'Sofern Sie freiwillig die KI-Chat-Funktion nutzen, erfolgt die Kommunikation über die offizielle API des von Ihnen gewählten Anbieters. Weitere Informationen zur Datenverarbeitung finden Sie in den Datenschutzrichtlinien der Anbieter:',
        h(
          'ul',
          { style: 'padding-left:1.2rem; margin:.4rem 0;' },
          h(
            'li',
            {},
            h('strong', {}, 'OpenAI, L.L.C.: '),
            h(
              'a',
              {
                href: 'https://openai.com/privacy',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              'https://openai.com/privacy'
            )
          ),
          h(
            'li',
            {},
            h('strong', {}, 'Google LLC (Gemini): '),
            h(
              'a',
              {
                href: 'https://policies.google.com/privacy',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              'https://policies.google.com/privacy'
            )
          ),
          h(
            'li',
            {},
            h('strong', {}, 'Anthropic PBC (Claude): '),
            h(
              'a',
              {
                href: 'https://www.anthropic.com/privacy',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              'https://www.anthropic.com/privacy'
            )
          )
        )
      ),

      h(
        'h2',
        {},
        '4. Speicherdauer und vollständige Datenlöschung (Recht auf Vergessenwerden)'
      ),
      h(
        'p',
        {},
        'Ihre Daten werden so lange gespeichert, wie Ihr Benutzerkonto aktiv ist.',
        h('br'),
        h('strong', {}, '2-Stufen-Kontolöschung: '),
        'Sie können Ihr Konto jederzeit im Profil (',
        h('code', {}, '#/profile'),
        ') über die Kontolöschungsfunktion selbstständig und unwiderruflich löschen. Nach Bestätigung per E-Mail werden alle mit dem Konto verknüpften Daten – einschließlich aller eigenen Aquarien, Messwerte, Alarme, Pflegelogs und hochgeladenen Fotos – kaskadierend und rückstandslos vom Server gelöscht (Art. 17 DSGVO).'
      ),

      h('h2', {}, '5. Ihre Rechte als betroffene Person'),
      h(
        'p',
        {},
        'Sie haben nach der DSGVO folgende Rechte gegenüber dem Verantwortlichen:'
      ),
      h(
        'ul',
        { style: 'padding-left:1.2rem; margin:.4rem 0;' },
        h(
          'li',
          {},
          h('strong', {}, 'Auskunftsrecht (Art. 15 DSGVO): '),
          'Sie können jederzeit Auskunft über Ihre gespeicherten Daten verlangen.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Berichtigungsrecht (Art. 16 DSGVO): '),
          'Sie können unrichtige Daten im Profil oder in den jeweiligen Aquarien korrigieren.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Löschungsrecht (Art. 17 DSGVO): '),
          'Sie können die vollständige Löschung Ihrer Daten veranlassen.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Recht auf Datenübertragbarkeit (Art. 20 DSGVO): '),
          'Sie können Ihre Messwerte jederzeit über die integrierte CSV/Excel-Exportfunktion in einem gängigen, maschinenlesbaren Format herunterladen.'
        ),
        h(
          'li',
          {},
          h(
            'strong',
            {},
            'Einschränkung der Verarbeitung (Art. 18 DSGVO) & Widerspruch (Art. 21 DSGVO): '
          ),
          'Sie können der Datenverarbeitung im gesetzlichen Rahmen widersprechen.'
        ),
        h(
          'li',
          {},
          h('strong', {}, 'Beschwerderecht (Art. 77 DSGVO): '),
          'Sie haben das Recht auf Beschwerde bei einer zuständigen Datenschutz-Aufsichtsbehörde.'
        )
      )
    );
  } else if (activeTab === 'licenses') {
    contentNode = h(
      'div',
      { class: 'legal-box stack' },
      h('h1', {}, '📜 Copyright & Open-Source-Lizenzen der Module'),
      h(
        'p',
        { class: 'muted', style: 'margin:0;' },
        'Diese Webanwendung basiert auf quelloffener Software (Open Source). Nachfolgend sind alle verwendeten Module, Autoren und Lizenzbestimmungen aufgeführt:'
      ),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.4rem;' },
        h(
          'div',
          { class: 'row between', style: 'align-items:center;' },
          h(
            'h3',
            { style: 'margin:0; font-size:1.1rem;' },
            '🐠 Aquarium-Logbuch (Hauptanwendung)'
          ),
          h('span', { class: 'chip ok' }, 'CC BY-NC-SA 4.0 (Copyleft & Non-Commercial)')
        ),
        h(
          'p',
          { style: 'margin:0; font-size:.92rem;' },
          'Copyright © 2026 Aquarium-Logbuch Projekt. Lizenz für private Nutzung und Weiterentwicklung.'
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.85rem;' },
          'Konzipiert und entwickelt unter Einsatz generativer KI (JetBrains Junie) gem. EU AI Act.'
        ),
        h(
          'div',
          {
            class: 'legal-badge-box',
            style: 'margin:.4rem 0 0 0; padding:.65rem .85rem;',
          },
          h(
            'strong',
            { style: 'display:block; margin-bottom:.2rem;' },
            '📜 Lizenzbedingungen für die Hauptanwendung (CC BY-NC-SA 4.0):'
          ),
          h(
            'ul',
            { style: 'margin:0; padding-left:1.2rem; font-size:.88rem;' },
            h(
              'li',
              {},
              h(
                'strong',
                {},
                'Nur privater & nicht-kommerzieller Gebrauch (NonCommercial): '
              ),
              'Die kostenlose Nutzung und Modifikation ist ausschließlich für persönliche, private und gemeinnützige Zwecke gestattet. Jede kommerzielle Nutzung, der Weiterverkauf oder das Anbieten als kostenpflichtiger Dienst (SaaS/Hosting) ist strengstens untersagt.'
            ),
            h(
              'li',
              {},
              h(
                'strong',
                {},
                'Striktes Copyleft & Weitergabe unter gleichen Bedingungen (ShareAlike): '
              ),
              'Bearbeitungen, Abwandlungen oder Weiterentwicklungen dürfen AUSSCHLIESSLICH unter denselben Lizenzbedingungen (CC BY-NC-SA 4.0) weitergegeben werden.'
            ),
            h(
              'li',
              {},
              h('strong', {}, 'Namensnennung (Attribution): '),
              'Der Urhebervermerk und Verweis auf das Projekt sowie diese Lizenz müssen stets unverändert beibehalten werden.'
            )
          )
        )
      ),

      h('h2', {}, 'Verwendete Module & Bibliotheken'),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.3rem;' },
        h(
          'div',
          { class: 'row between' },
          h('strong', {}, 'express (v5.3.0)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.88rem;' },
          'Schnelles, unaufdringliches Web-Framework und Routing für Node.js.'
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size:.82rem;' },
          'Copyright (c) StrongLoop, Inc., Express contributors'
        )
      ),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.3rem;' },
        h(
          'div',
          { class: 'row between' },
          h('strong', {}, 'better-sqlite3 (v13.0.3)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.88rem;' },
          'Schnellster und einfachster C++ SQLite3-Treiber für Node.js.'
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size:.82rem;' },
          'Copyright (c) Joshua Wise'
        )
      ),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.3rem;' },
        h(
          'div',
          { class: 'row between' },
          h('strong', {}, 'mongodb (v7.7.0)'),
          h('span', { class: 'chip ok' }, 'Apache License 2.0')
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.88rem;' },
          'Offizieller MongoDB-Treiber für Node.js zur NoSQL-Datenspeicherung.'
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size:.82rem;' },
          'Copyright (c) MongoDB, Inc.'
        )
      ),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.3rem;' },
        h(
          'div',
          { class: 'row between' },
          h('strong', {}, 'chart.js (v4.5.1)'),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.88rem;' },
          'Einfache, flexible HTML5-Canvas-Diagramme für Messwertverläufe.'
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size:.82rem;' },
          'Copyright (c) Chart.js Contributors'
        )
      ),

      h(
        'div',
        { class: 'license-card stack', style: 'gap:.3rem;' },
        h(
          'div',
          { class: 'row between' },
          h(
            'strong',
            {},
            'Node.js Core Modules (crypto, fs, http, https, tls, net)'
          ),
          h('span', { class: 'chip ok' }, 'MIT License')
        ),
        h(
          'p',
          { class: 'muted', style: 'margin:0; font-size:.88rem;' },
          'Integrierte Laufzeitmodule für Verschlüsselung, Dateisystem und Netzwerkprotokolle.'
        ),
        h(
          'div',
          { class: 'muted', style: 'font-size:.82rem;' },
          'Copyright (c) Node.js contributors'
        )
      ),

      h('h2', {}, 'Lizenztexte'),

      h(
        'h3',
        {},
        'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)'
      ),
      h(
        'pre',
        { class: 'license-pre' },
        `Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
<https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>

By exercising the Licensed Rights, You accept and agree to be bound by the terms and
conditions of this Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
Public License ("Public License").

Summary of Terms:
- Attribution (BY): You must give appropriate credit, provide a link to the license,
  and indicate if changes were made.
- NonCommercial (NC): You may not use the material for commercial purposes.
- ShareAlike (SA / Copyleft): If you remix, transform, or build upon the material,
  you must distribute your contributions under the same license as the original.
- No additional restrictions: You may not apply legal terms or technological measures
  that legally restrict others from doing anything the license permits.

Section 2 – Scope:
Subject to the terms and conditions of this Public License, the Licensor hereby grants
You a worldwide, royalty-free, non-sublicensable, non-exclusive, irrevocable license to:
A. reproduce and Share the Licensed Material for NonCommercial purposes only; and
B. produce, reproduce, and Share Adapted Material for NonCommercial purposes only.

Section 3 – License Conditions:
a. Attribution: You must retain copyright notices, license notices, and author credits.
b. NonCommercial: Commercial advantage or monetary compensation is prohibited.
c. ShareAlike: If You Share Adapted Material You produce, the Adapter's License You apply
   must be this Public License with the same License Elements (CC BY-NC-SA 4.0).`
      ),

      h('h3', {}, 'The MIT License (MIT)'),
      h(
        'pre',
        { class: 'license-pre' },
        `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
      ),

      h('h3', {}, 'Apache License, Version 2.0'),
      h(
        'pre',
        { class: 'license-pre' },
        `Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`
      )
    );
  } else if (activeTab === 'kontakt') {
    contentNode = h(
      'div',
      { class: 'legal-box stack' },
      h('h1', {}, '✉️ Kontakt & Support'),
      h(
        'p',
        { class: 'muted', style: 'margin:0;' },
        'Haben Sie Fragen zur Anwendung, Feedback oder Anliegen bezüglich des Datenschutzes?'
      ),

      h(
        'div',
        { class: 'compat-box info stack', style: 'gap:.6rem; margin-top:.8rem;' },
        h(
          'div',
          {},
          h('strong', {}, '📧 Kontakt & Support:'),
          h('br'),
          h(
            'a',
            { href: `mailto:${contactMail}`, style: 'font-size:1.05rem; font-weight:600;' },
            contactMail
          )
        ),
        h(
          'div',
          {},
          h('strong', {}, '⚖️ Impressum & Rechtliche Anfragen:'),
          h('br'),
          h(
            'a',
            { href: `mailto:${imprintMail}`, style: 'font-size:1rem; font-weight:500;' },
            imprintMail
          )
        ),
        h(
          'div',
          {},
          h('strong', {}, '🛠️ Technische Unterstützung:'),
          h(
            'p',
            { style: 'margin:.2rem 0 0; font-size:.92rem;' },
            'Bei Fragen zur Installation, Konfiguration (z. B. SMTP-Mailserver, OIDC oder Backups) wenden Sie sich bitte an Ihren Server-Administrator oder konsultieren Sie die Dokumentation.'
          )
        ),
        h(
          'div',
          {},
          h('strong', {}, '🔒 Datenschutz & Auskunftsersuchen:'),
          h(
            'p',
            { style: 'margin:.2rem 0 0; font-size:.92rem;' },
            'Anfragen bezüglich gespeicherter Daten oder die Ausübung Ihrer Betroffenenrechte nach der DSGVO können direkt an die oben genannte Support-E-Mail-Adresse gerichtet werden.'
          )
        )
      )
    );
  }

  mount(h('div', { class: 'legal-container stack' }, topNavRow, tabsBar, contentNode));
}
