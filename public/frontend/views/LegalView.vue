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
      <h1>{{ t("legal.content.imprintHeading") }}</h1>
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
          {{ t("legal.content.transparencyHeading") }}
        </h3>
        <p style="margin: 0; font-size: 0.93rem">
          {{ t("legal.content.developmentNotice") }}
        </p>
        <p style="margin: 0; font-size: 0.9rem; color: var(--ink-soft)">
          {{ t("legal.content.expertNotice") }}
        </p>
      </div>
      <h2>{{ t("legal.content.providerHeading") }}</h2>
      <p>
        {{ t("legal.content.appDescription") }}<br /><strong
          >{{ t("legal.content.providerLabel") }}</strong
        >
        {{ t("legal.content.providerValue") }}<br /><strong
          >{{ t("legal.content.imprintEmailLabel") }}</strong
        >
        <a :href="`mailto:${imprintMail}`">{{ imprintMail }}</a
        ><br /><strong>{{ t("legal.content.hostingLabel") }}</strong> {{ t("legal.content.hostingValue") }}
      </p>
      <h2>{{ t("legal.content.editorialHeading") }}</h2>
      <p>
        {{ t("legal.content.editorialNotice") }}
      </p>
      <h2>{{ t("legal.content.liabilityHeading") }}</h2>
      <p>
        {{ t("legal.content.contentLiability") }}
      </p>
      <p>
        {{ t("legal.content.linkLiability") }}
      </p>
      <h2>{{ t("legal.content.disputesHeading") }}</h2>
      <p>
        {{ t("legal.content.disputesPlatform") }}
        <a
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noopener noreferrer"
          >https://ec.europa.eu/consumers/odr/</a
        ><br />{{ t("legal.content.disputesNotice") }}
      </p>
    </div>
    <div v-if="page === 'datenschutz'" class="legal-box stack">
      <h1>{{ t("legal.content.privacyHeading") }}</h1>
      <section class="card stack"><h2>{{ t("social.privacyTitle") }}</h2><p>{{ t("social.privacyText") }}</p></section>
      <p class="muted" style="margin: 0">
        {{ t("legal.content.privacyIntro") }}
      </p>
      <h2>{{ t("legal.content.controllerHeading") }}</h2>
      <p>
        {{ t("legal.content.controllerNotice") }}<br />{{ t("legal.content.contactLabel") }}
        <a :href="`mailto:${contactMail}`">{{ contactMail }}</a>
      </p>
      <h2>{{ t("legal.content.dataHeading") }}</h2>
      <ul style="padding-left: 1.2rem; margin: 0.4rem 0">
        <li>
          <strong
            >{{ t("legal.content.accountLabel") }} </strong
          >{{ t("legal.content.accountNotice") }}
        </li>
        <li>
          <strong
            >{{ t("legal.content.aquariumLabel") }} </strong
          >{{ t("legal.content.aquariumNotice") }}
        </li>
        <li>
          <strong
            >{{ t("legal.content.storageLabel") }} </strong
          >{{ t("legal.content.cookieIntro") }}<code>aquarium_session</code>{{ t("legal.content.cookieNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.emailLabel") }} </strong
          >{{ t("legal.content.emailNotice") }}
        </li>
        <li>
          <strong
            >{{ t("legal.content.aiLabel") }} </strong
          >{{ t("legal.content.aiNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.logsLabel") }} </strong>{{ t("legal.content.logsNotice") }}
        </li>
      </ul>
      <h2>
        {{ t("legal.content.localHeading") }}
      </h2>
      <p>
        {{ t("legal.content.localNotice") }}
      </p>
      <div>
        {{ t("legal.content.providerPrivacyNotice") }}
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
        {{ t("legal.content.retentionHeading") }}
      </h2>
      <p>
        {{ t("legal.content.retentionNotice") }}<br /><strong>{{ t("legal.content.deletionLabel") }} </strong>{{ t("legal.content.deletionIntro") }}<code>#/profile</code>{{ t("legal.content.deletionNotice") }}
      </p>
      <h2>{{ t("legal.content.rightsHeading") }}</h2>
      <p>
        {{ t("legal.content.rightsIntro") }}
      </p>
      <ul style="padding-left: 1.2rem; margin: 0.4rem 0">
        <li>
          <strong>{{ t("legal.content.accessLabel") }} </strong>{{ t("legal.content.accessNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.rectificationLabel") }} </strong>{{ t("legal.content.rectificationNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.erasureLabel") }} </strong>{{ t("legal.content.erasureNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.portabilityLabel") }} </strong>{{ t("legal.content.portabilityNotice") }}
        </li>
        <li>
          <strong
            >{{ t("legal.content.restrictionLabel") }} </strong
          >{{ t("legal.content.restrictionNotice") }}
        </li>
        <li>
          <strong>{{ t("legal.content.complaintLabel") }} </strong>{{ t("legal.content.complaintNotice") }}
        </li>
      </ul>
    </div>
    <div v-if="page === 'licenses'" class="legal-box stack">
      <h1>{{ t("legal.content.licensesHeading") }}</h1>
      <p class="muted" style="margin: 0">
        {{ t("legal.content.licensesIntro") }}
      </p>
      <div class="license-card stack"><div class="row between"><strong>sharp (v0.35.5)</strong><span class="chip ok">Apache License 2.0</span></div><p>{{ t("social.imageLicense") }}</p><p class="muted">Copyright © Lovell Fuller and contributors · <a href="https://github.com/lovell/sharp/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Apache-2.0</a></p></div>
      <div class="license-card stack" style="gap: 0.4rem">
        <div class="row between" style="align-items: center">
          <h3 style="margin: 0; font-size: 1.1rem">
            {{ t("legal.content.mainAppHeading") }}
          </h3>
          <span class="chip ok"
            >CC BY-NC-SA 4.0 (Copyleft &amp; Non-Commercial)</span
          >
        </div>
        <p style="margin: 0; font-size: 0.92rem">
          {{ t("legal.content.mainAppCopyright") }}
        </p>
        <p class="muted" style="margin: 0; font-size: 0.85rem">
          {{ t("legal.content.mainAppAiNotice") }}
        </p>
        <div
          class="legal-badge-box"
          style="margin: 0.4rem 0 0 0; padding: 0.65rem 0.85rem"
        >
          <strong style="display: block; margin-bottom: 0.2rem"
            >{{ t("legal.content.mainAppTermsHeading") }}</strong
          >
          <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem">
            <li>
              <strong
                >{{ t("legal.content.noncommercialLabel") }} </strong
              >{{ t("legal.content.noncommercialNotice") }}
            </li>
            <li>
              <strong
                >{{ t("legal.content.sharealikeLabel") }} </strong
              >{{ t("legal.content.sharealikeNotice") }}
            </li>
            <li>
              <strong>{{ t("legal.content.attributionLabel") }} </strong>{{ t("legal.content.attributionNotice") }}
            </li>
          </ul>
        </div>
      </div>
      <h2>{{ t("legal.content.modulesHeading") }}</h2>
      <div class="license-card stack" style="gap: 0.3rem">
        <div class="row between">
          <strong>express (v5.3.0)</strong
          ><span class="chip ok">MIT License</span>
        </div>
        <p class="muted" style="margin: 0; font-size: 0.88rem">
          {{ t("legal.content.expressDescription") }}
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
          {{ t("legal.content.sqliteDescription") }}
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
          {{ t("legal.content.mongoDescription") }}
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
          {{ t("legal.content.chartDescription") }}
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
          {{ t("legal.content.nodeDescription") }}
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
      <h2>{{ t("legal.content.licenseTextsHeading") }}</h2>
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
      <h1>{{ t("legal.content.contactHeading") }}</h1>
      <p class="muted" style="margin: 0">
        {{ t("legal.content.contactIntro") }}
      </p>
      <div
        class="compat-box info stack"
        style="gap: 0.6rem; margin-top: 0.8rem"
      >
        <div>
          <strong>{{ t("legal.content.supportLabel") }}</strong><br /><a
            :href="`mailto:${contactMail}`"
            style="font-size: 1.05rem; font-weight: 600"
            >{{ contactMail }}</a
          >
        </div>
        <div>
          <strong>{{ t("legal.content.legalContactLabel") }}</strong><br /><a
            :href="`mailto:${imprintMail}`"
            style="font-size: 1rem; font-weight: 500"
            >{{ imprintMail }}</a
          >
        </div>
        <div>
          <strong>{{ t("legal.content.technicalLabel") }}</strong>
          <p style="margin: 0.2rem 0 0; font-size: 0.92rem">
            {{ t("legal.content.technicalNotice") }}
          </p>
        </div>
        <div>
          <strong>{{ t("legal.content.privacyContactLabel") }}</strong>
          <p style="margin: 0.2rem 0 0; font-size: 0.92rem">
            {{ t("legal.content.privacyContactNotice") }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
