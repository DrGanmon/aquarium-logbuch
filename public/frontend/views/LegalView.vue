<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { session, t, themeIcon, toggleTheme, errorMessage } from "../state";
const props = defineProps<{ page: string }>();
const info = ref<{ contactEmail: string; imprintEmail: string }>({
  contactEmail: "",
  imprintEmail: "",
});
const error = ref("");
const contactMail = computed(() => info.value.contactEmail);
const imprintMail = computed(
  () => info.value.imprintEmail || info.value.contactEmail,
);
onMounted(async () => {
  try {
    info.value = await api("/legal-info");
  } catch (e) {
    error.value = errorMessage(e);
  }
});
</script>
<template>
  <div class="legal-container stack">
    <div class="row between" style="margin-bottom: 1rem; align-items: center">
      <a class="btn ghost small" href="#/">← {{ t("common.back") }}</a>
      <div v-if="!session.user" class="row">
        <img src="favicon-32x32.png" alt="Logo" width="24" height="24" /><span
          class="muted"
          >{{ t("common.appName") }}</span
        ><button class="btn small ghost" @click="toggleTheme">
          {{ themeIcon }}
        </button>
      </div>
    </div>
    <nav class="legal-tabs" role="tablist">
      <a
        v-for="tab in [
          { id: 'impressum', hash: 'impressum', label: 'footer.imprint' },
          { id: 'datenschutz', hash: 'datenschutz', label: 'footer.privacy' },
          { id: 'licenses', hash: 'lizenzen', label: 'footer.licenses' },
          { id: 'kontakt', hash: 'kontakt', label: 'footer.contact' },
        ]"
        :key="tab.id"
        class="legal-tab"
        :class="{ active: page === tab.id }"
        :href="'#/' + tab.hash"
        role="tab"
        :aria-selected="page === tab.id"
        >{{ t(tab.label) }}</a
      >
    </nav>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="page === 'impressum'" class="legal-box stack">
      <h1>⚖️ Impressum &amp; Rechtliche Hinweise</h1>
      <div class="legal-badge-box stack" style="gap: 0.4rem">
        <h3
          style="
            margin: 0;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            color: var(--ink);
          "
        >
          🤖 Transparenzpflicht nach Art. 50 EU AI Act (Verordnung (EU)
          2024/1689)
        </h3>
        <p style="margin: 0; font-size: 0.93rem">
          Dieses Softwaresystem (Aquarium-Logbuch) wurde unter Einsatz
          generativer Künstlicher Intelligenz (JetBrains Junie /
          KI-Programmierassistenten) konzipiert, programmiert und strukturiert.
          Der Programmcode, die Datenbankadapter, Frontend-Ansichten sowie
          Hilfstexte wurden KI-gestützt generiert und qualitätsgesichert.
        </p>
        <p style="margin: 0; font-size: 0.9rem; color: var(--ink-soft)">
          Wichtiger Fachhinweis: Die in der App hinterlegten Wasserwertgrenzen,
          Richtwerte, Alarme, Pflegeregeln und Artendaten dienen der privaten
          aquaristischen Orientierung. Sie stellen keine tiermedizinische oder
          biologisch-chemische Fachberatung dar.
        </p>
      </div>
      <h2>1. Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</h2>
      <p>
        Aquarium-Logbuch – Webanwendung zur Verwaltung und Protokollierung von
        Aquarien, Wasserwerten und Pflegemaßnahmen.<br /><strong
          >Diensteanbieter / Betreiber:</strong
        >
        Betreiber der jeweiligen Server-Instanz / Administrator<br /><strong
          >Kontakt-E-Mail (Impressum):</strong
        >
        <a :href="`mailto:${imprintMail}`">{{ imprintMail }}</a
        ><br /><strong>Hosting:</strong> Eigenbetriebene Instanz (Self-Hosted /
        On-Premises)
      </p>
      <h2>2. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        Verantwortlich für redaktionelle Inhalte ist der jeweilige Betreiber
        bzw. Administrator dieser Anwendungsinstanz.
      </p>
      <h2>3. Haftung für Inhalte und Links</h2>
      <p>
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf
        diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8
        bis 10 DDG sind Diensteanbieter jedoch nicht verpflichtet, übermittelte
        oder gespeicherte fremde Informationen ständig zu überwachen oder nach
        Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
        Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
        Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
      </p>
      <p>
        Diese Anwendung enthält ggf. Links zu externen Websites Dritter, auf
        deren Inhalte kein Einfluss besteht. Deshalb kann für diese fremden
        Inhalte auch keine Gewähr übernommen werden. Für die Inhalte der
        verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
        Seiten verantwortlich.
      </p>
      <h2>4. EU-Streitschlichtung &amp; Verbraucherstreitbeilegung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur
        Online-Streitbeilegung (OS) bereit:
        <a
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noopener noreferrer"
          >https://ec.europa.eu/consumers/odr/</a
        ><br />Wir sind nicht bereit oder verpflichtet, an
        Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle im
        Sinne des Verbraucherstreitbeilegungsgesetzes (VSBG) teilzunehmen.
      </p>
    </div>
    <div v-if="page === 'datenschutz'" class="legal-box stack">
      <h1>🔒 Datenschutzerklärung</h1>
      <p class="muted" style="margin: 0">
        Informationen über die Verarbeitung personenbezogener Daten nach Art.
        12, 13, 14 und 21 der Datenschutz-Grundverordnung (DSGVO).
      </p>
      <h2>1. Verantwortliche Stelle</h2>
      <p>
        Verantwortlich für die Datenverarbeitung im Sinne der DSGVO ist der
        Administrator bzw. Betreiber dieser Serverinstanz.<br />Kontakt:
        <a :href="`mailto:${contactMail}`">{{ contactMail }}</a>
      </p>
      <h2>2. Erhobene Datenarten und Verarbeitungszwecke</h2>
      <ul style="padding-left: 1.2rem; margin: 0.4rem 0">
        <li>
          <strong
            >Benutzerkonto &amp; Registrierung (Art. 6 Abs. 1 lit. b DSGVO): </strong
          >Bei der Registrierung werden Benutzername, E-Mail-Adresse und ein
          kryptografischer Passwort-Hash gespeichert. Die E-Mail-Adresse dient
          der Kontoaktivierung, Passwort-Wiederherstellung und
          sicherheitsrelevanten Benachrichtigungen.
        </li>
        <li>
          <strong
            >Aquariendaten, Messwerte &amp; Fotos (Art. 6 Abs. 1 lit. b DSGVO): </strong
          >Die von Ihnen eingegebenen Daten (Aquariennamen, Abmessungen,
          Wasserparameter, Pflegemaßnahmen, Besatzlisten und hochgeladenen
          Bilder) werden zur Bereitstellung der Protokollierungs- und
          Auswertungsfunktionen in der Datenbank gespeichert.
        </li>
        <li>
          <strong
            >Sitzungs-Cookies &amp; Lokaler Speicher (Art. 6 Abs. 1 lit. f DSGVO
            / § 25 Abs. 2 TDDDG): </strong
          >Zur Benutzerauthentifizierung wird ein technisch zwingend
          erforderliches, verschlüsseltes Session-Cookie
          (<code>aquarium_session</code>, HttpOnly, SameSite=Lax) verwendet.
          Lokale Anzeigeeinstellungen (z. B. Dark Mode oder Filtereinstellungen)
          werden lokal im Browser (localStorage) abgelegt. Es werden keine
          Werbe- oder Tracking-Cookies eingesetzt.
        </li>
        <li>
          <strong>E-Mail-Versand (Art. 6 Abs. 1 lit. b &amp; f DSGVO): </strong
          >Für Systembenachrichtigungen (Verifizierungslinks, Passwort-Reset,
          Freigabe-Einladungen, konfigurierte Mess-/Düngungserinnerungen) werden
          E-Mails über den hinterlegten SMTP-Server versendet.
        </li>
        <li>
          <strong
            >KI-Chat-Assistent &amp; Sprachmodelle (Art. 6 Abs. 1 lit. a &amp; b
            DSGVO): </strong
          >Die Nutzung des KI-Aquarium-Assistenten ist vollständig freiwillig
          („Bring Your Own Key“). Wenn Sie im Profil einen persönlichen
          API-Schlüssel für OpenAI (ChatGPT), Google Gemini oder Anthropic
          Claude hinterlegen und eine Chat-Anfrage absenden, werden die
          Stammdaten des Aquariums (Name, Volumen, Abmessungen, Technik,
          Bodengrund), der Besatz (Pflanzen- und Tierarten) sowie die letzten
          bis zu 10 Messungen als Kontext an den jeweiligen Anbieter
          übermittelt, um fachbezogene Antworten zu generieren. API-Schlüssel
          werden sicher in der Datenbank gespeichert, im Frontend nur maskiert
          angezeigt und können im Benutzerprofil jederzeit restlos gelöscht
          werden.
        </li>
        <li>
          <strong>Server-Logdateien (Art. 6 Abs. 1 lit. f DSGVO): </strong>Beim
          Zugriff werden technische Serverprotokolle (IP-Adresse, Zeitstempel,
          HTTP-Status, Fehlermeldungen) erfasst, um die Funktionsfähigkeit,
          Verfügbarkeit und Sicherheit der Anwendung zu gewährleisten.
        </li>
      </ul>
      <h2>
        3. Lokale Verarbeitung, Keine externen Tracker &amp; Externe Dienste
      </h2>
      <p>
        Diese Anwendung ist für den autarken Eigenbetrieb (Self-Hosting)
        konzipiert. Es findet keinerlei Tracking oder Weitergabe
        personenbezogener Daten an Dritte oder Werbenetzwerke statt. Alle
        Bibliotheken (einschließlich Chart.js) und Schriftarten werden lokal vom
        Server geladen – es bestehen keine externen Abhängigkeiten von
        Drittanbieter-CDNs.
      </p>
      <div>
        Sofern Sie freiwillig die KI-Chat-Funktion nutzen, erfolgt die
        Kommunikation über die offizielle API des von Ihnen gewählten Anbieters.
        Weitere Informationen zur Datenverarbeitung finden Sie in den
        Datenschutzrichtlinien der Anbieter:
        <ul style="padding-left: 1.2rem; margin: 0.4rem 0">
          <li>
            <strong>OpenAI, L.L.C.: </strong
            ><a
              href="https://openai.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              >https://openai.com/privacy</a
            >
          </li>
          <li>
            <strong>Google LLC (Gemini): </strong
            ><a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              >https://policies.google.com/privacy</a
            >
          </li>
          <li>
            <strong>Anthropic PBC (Claude): </strong
            ><a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              >https://www.anthropic.com/privacy</a
            >
          </li>
        </ul>
      </div>
      <h2>
        4. Speicherdauer und vollständige Datenlöschung (Recht auf
        Vergessenwerden)
      </h2>
      <p>
        Ihre Daten werden so lange gespeichert, wie Ihr Benutzerkonto aktiv
        ist.<br /><strong>2-Stufen-Kontolöschung: </strong>Sie können Ihr Konto
        jederzeit im Profil (<code>#/profile</code>) über die
        Kontolöschungsfunktion selbstständig und unwiderruflich löschen. Nach
        Bestätigung per E-Mail werden alle mit dem Konto verknüpften Daten –
        einschließlich aller eigenen Aquarien, Messwerte, Alarme, Pflegelogs und
        hochgeladenen Fotos – kaskadierend und rückstandslos vom Server gelöscht
        (Art. 17 DSGVO).
      </p>
      <h2>5. Ihre Rechte als betroffene Person</h2>
      <p>
        Sie haben nach der DSGVO folgende Rechte gegenüber dem Verantwortlichen:
      </p>
      <ul style="padding-left: 1.2rem; margin: 0.4rem 0">
        <li>
          <strong>Auskunftsrecht (Art. 15 DSGVO): </strong>Sie können jederzeit
          Auskunft über Ihre gespeicherten Daten verlangen.
        </li>
        <li>
          <strong>Berichtigungsrecht (Art. 16 DSGVO): </strong>Sie können
          unrichtige Daten im Profil oder in den jeweiligen Aquarien
          korrigieren.
        </li>
        <li>
          <strong>Löschungsrecht (Art. 17 DSGVO): </strong>Sie können die
          vollständige Löschung Ihrer Daten veranlassen.
        </li>
        <li>
          <strong>Recht auf Datenübertragbarkeit (Art. 20 DSGVO): </strong>Sie
          können Ihre Messwerte jederzeit über die integrierte
          CSV/Excel-Exportfunktion in einem gängigen, maschinenlesbaren Format
          herunterladen.
        </li>
        <li>
          <strong
            >Einschränkung der Verarbeitung (Art. 18 DSGVO) &amp; Widerspruch
            (Art. 21 DSGVO): </strong
          >Sie können der Datenverarbeitung im gesetzlichen Rahmen
          widersprechen.
        </li>
        <li>
          <strong>Beschwerderecht (Art. 77 DSGVO): </strong>Sie haben das Recht
          auf Beschwerde bei einer zuständigen Datenschutz-Aufsichtsbehörde.
        </li>
      </ul>
    </div>
    <div v-if="page === 'licenses'" class="legal-box stack">
      <h1>📜 Copyright &amp; Open-Source-Lizenzen der Module</h1>
      <p class="muted" style="margin: 0">
        Diese Webanwendung basiert auf quelloffener Software (Open Source).
        Nachfolgend sind alle verwendeten Module, Autoren und Lizenzbestimmungen
        aufgeführt:
      </p>
      <div class="license-card stack" style="gap: 0.4rem">
        <div class="row between" style="align-items: center">
          <h3 style="margin: 0; font-size: 1.1rem">
            🐠 Aquarium-Logbuch (Hauptanwendung)
          </h3>
          <span class="chip ok"
            >CC BY-NC-SA 4.0 (Copyleft &amp; Non-Commercial)</span
          >
        </div>
        <p style="margin: 0; font-size: 0.92rem">
          Copyright © 2026 Aquarium-Logbuch Projekt. Lizenz für private Nutzung
          und Weiterentwicklung.
        </p>
        <p class="muted" style="margin: 0; font-size: 0.85rem">
          Konzipiert und entwickelt unter Einsatz generativer KI (JetBrains
          Junie) gem. EU AI Act.
        </p>
        <div
          class="legal-badge-box"
          style="margin: 0.4rem 0 0 0; padding: 0.65rem 0.85rem"
        >
          <strong style="display: block; margin-bottom: 0.2rem"
            >📜 Lizenzbedingungen für die Hauptanwendung (CC BY-NC-SA
            4.0):</strong
          >
          <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem">
            <li>
              <strong
                >Nur privater &amp; nicht-kommerzieller Gebrauch
                (NonCommercial): </strong
              >Die kostenlose Nutzung und Modifikation ist ausschließlich für
              persönliche, private und gemeinnützige Zwecke gestattet. Jede
              kommerzielle Nutzung, der Weiterverkauf oder das Anbieten als
              kostenpflichtiger Dienst (SaaS/Hosting) ist strengstens untersagt.
            </li>
            <li>
              <strong
                >Striktes Copyleft &amp; Weitergabe unter gleichen Bedingungen
                (ShareAlike): </strong
              >Bearbeitungen, Abwandlungen oder Weiterentwicklungen dürfen
              AUSSCHLIESSLICH unter denselben Lizenzbedingungen (CC BY-NC-SA
              4.0) weitergegeben werden.
            </li>
            <li>
              <strong>Namensnennung (Attribution): </strong>Der Urhebervermerk
              und Verweis auf das Projekt sowie diese Lizenz müssen stets
              unverändert beibehalten werden.
            </li>
          </ul>
        </div>
      </div>
      <h2>Verwendete Module &amp; Bibliotheken</h2>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>express (v5.3.0)</strong
          ><span class="chip ok">MIT License</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          Schnelles, unaufdringliches Web-Framework und Routing für Node.js.
        </p>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) StrongLoop, Inc., Express contributors
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>better-sqlite3 (v13.0.3)</strong
          ><span class="chip ok">MIT License</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          Schnellster und einfachster C++ SQLite3-Treiber für Node.js.
        </p>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Joshua Wise
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>mongodb (v7.7.0)</strong
          ><span class="chip ok">Apache License 2.0</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          Offizieller MongoDB-Treiber für Node.js zur NoSQL-Datenspeicherung.
        </p>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) MongoDB, Inc.
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>chart.js (v4.5.1)</strong
          ><span class="chip ok">MIT License</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          Einfache, flexible HTML5-Canvas-Diagramme für Messwertverläufe.
        </p>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Chart.js Contributors
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong
            >Node.js Core Modules (crypto, fs, http, https, tls, net)</strong
          ><span class="chip ok">MIT License</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          Integrierte Laufzeitmodule für Verschlüsselung, Dateisystem und
          Netzwerkprotokolle.
        </p>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Node.js contributors
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>Vue 3 (v3.5.43)</strong><span class="chip ok">MIT</span>
        </div>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Evan You
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>Vite (v8.3.4)</strong><span class="chip ok">MIT</span>
        </div>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Vite contributors
        </div>
      </div>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>TypeScript (v5.9.3)</strong
          ><span class="chip ok">Apache License 2.0</span>
        </div>
        <div class="muted" style="font-size: 0.82rem">
          Copyright (c) Microsoft Corporation
        </div>
      </div>
      <h2>Lizenztexte</h2>
      <h3>
        Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
        (CC BY-NC-SA 4.0)
      </h3>
      <pre class="license-pre">
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
&lt;https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode&gt;

By exercising the Licensed Rights, You accept and agree to be bound by the terms and
conditions of this Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
Public License (&quot;Public License&quot;).

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
   must be this Public License with the same License Elements (CC BY-NC-SA 4.0).</pre>
      <h3>The MIT License (MIT)</h3>
      <pre class="license-pre">
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the &quot;Software&quot;), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.</pre>
      <h3>Apache License, Version 2.0</h3>
      <pre class="license-pre">
Licensed under the Apache License, Version 2.0 (the &quot;License&quot;);
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an &quot;AS IS&quot; BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.</pre>
    </div>
    <div v-if="page === 'kontakt'" class="legal-box stack">
      <h1>✉️ Kontakt &amp; Support</h1>
      <p class="muted" style="margin: 0">
        Haben Sie Fragen zur Anwendung, Feedback oder Anliegen bezüglich des
        Datenschutzes?
      </p>
      <div
        class="compat-box info stack"
        style="gap: 0.6rem; margin-top: 0.8rem"
      >
        <div>
          <strong>📧 Kontakt &amp; Support:</strong><br /><a
            :href="`mailto:${contactMail}`"
            style="font-size: 1.05rem; font-weight: 600"
            >{{ contactMail }}</a
          >
        </div>
        <div>
          <strong>⚖️ Impressum &amp; Rechtliche Anfragen:</strong><br /><a
            :href="`mailto:${imprintMail}`"
            style="font-size: 1rem; font-weight: 500"
            >{{ imprintMail }}</a
          >
        </div>
        <div>
          <strong>🛠️ Technische Unterstützung:</strong>
          <p style="margin: 0.2rem 0 0; font-size: 0.92rem">
            Bei Fragen zur Installation, Konfiguration (z. B. SMTP-Mailserver,
            OIDC oder Backups) wenden Sie sich bitte an Ihren
            Server-Administrator oder konsultieren Sie die Dokumentation.
          </p>
        </div>
        <div>
          <strong>🔒 Datenschutz &amp; Auskunftsersuchen:</strong>
          <p style="margin: 0.2rem 0 0; font-size: 0.92rem">
            Anfragen bezüglich gespeicherter Daten oder die Ausübung Ihrer
            Betroffenenrechte nach der DSGVO können direkt an die oben genannte
            Support-E-Mail-Adresse gerichtet werden.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
