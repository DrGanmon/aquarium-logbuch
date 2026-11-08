<script setup lang="ts">
import { computed } from "vue";
import type { Translate } from "../types";
import { language } from "../state";
defineProps<{ t: Translate }>();
import { appVersion as version } from "../composables/frontend-update";
const mobileServer = document.documentElement?.dataset.mobileServer;
// The guide is available in German and English; link the version matching the interface language.
const guideUrl = computed(() => { const path = language.value === 'en' ? 'handbuch/en/' : 'handbuch/';return mobileServer ? new URL(path, mobileServer).href : path; });
function changeServer() { window.location.reload(); }
</script>

<template>
  <footer class="site-footer" id="site-footer">
    <div class="footer-container">
      <div class="footer-brand">
        <span class="footer-copy">{{ t("footer.copyright") }}</span>
        <span class="footer-ai-badge" :title="t('footer.aiBadgeTitle')">{{
          t("footer.aiBadge")
        }}</span>
      </div>
      <nav
        class="footer-nav"
        :aria-label="t('footer.navLabel')"
      >
        <a class="footer-link" :href="guideUrl" target="_blank" rel="noopener noreferrer">{{ t("footer.userGuide") }}</a>
        <button v-if="mobileServer" class="btn small ghost" type="button" @click="changeServer">Server wechseln / Change server</button>
        <a class="footer-link" :href="'#/social'">{{ t("social.title") }}</a>
        <a class="footer-link" :href="'#/impressum'">{{ t("footer.imprint") }}</a>
        <a class="footer-link" :href="'#/agb'">{{ t("footer.terms") }}</a>
        <a class="footer-link" :href="'#/datenschutz'">{{
          t("footer.privacy")
        }}</a>
        <a class="footer-link" :href="'#/lizenzen'">{{ t("footer.licenses") }}</a>
        <a class="footer-link" :href="'#/kontakt'">{{ t("footer.contact") }}</a>
        <a
          class="footer-link"
          href="https://github.com/DrGanmon/aquarium-logbuch"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t("footer.repo") }}</a
        >
      </nav>
      <span class="footer-version" :aria-label="`${t('footer.version')}: ${version}`">{{ version }}</span>
    </div>
  </footer>
</template>
