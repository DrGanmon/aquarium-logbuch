<script setup lang="ts">
import type { Translate } from "../types";
defineProps<{ t: Translate }>();
import { appVersion as version } from "../composables/frontend-update";
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
        aria-label="Rechtliche Hinweise und Informationen"
      >
        <a class="footer-link" :href="'#/social'"><span aria-hidden="true">👥 </span>{{ t("social.title") }}</a>
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
