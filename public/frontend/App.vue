<script setup lang="ts">
import { computed, onMounted } from "vue";
import FrontendUpdate from "./components/FrontendUpdate.vue";
import Topbar from "./components/Topbar.vue";
import SiteFooter from "./components/SiteFooter.vue";
import AuthView from "./views/AuthView.vue";
import AquariumList from "./views/AquariumList.vue";
import AquariumView from "./views/AquariumView.vue";
import MeasureView from "./views/MeasureView.vue";
import ProfileView from "./views/ProfileView.vue";
import SpeciesView from "./views/SpeciesView.vue";
import SocialView from "./views/SocialView.vue";
import HealthView from "./views/HealthView.vue";
import AdminView from "./views/AdminView.vue";
import LegalView from "./views/LegalView.vue";
import ShareView from "./views/ShareView.vue";
import { session, language, notification, t } from "./state";
import { route, initialize, toggleLanguage, logout } from "./router";
const legalPage = computed(
  () =>
    (
      ({
        "/impressum": "impressum",
        "/imprint": "impressum",
        "/datenschutz": "datenschutz",
        "/privacy": "datenschutz",
        "/lizenzen": "licenses",
        "/licenses": "licenses",
        "/copyright": "licenses",
        "/kontakt": "kontakt",
        "/contact": "kontakt",
      }) as Record<string, string>
    )[route.value.path],
);
const publicAuth = computed(() =>
  ["/verify-email", "/reset-password", "/delete-account"].includes(
    route.value.path,
  ),
);
onMounted(initialize);
</script>
<template>
  <Topbar
    :public-view="route.path.startsWith('/social')"
    :user="session.user"
    :language="language"
    :t="t"
    @language="toggleLanguage"
    @logout="logout"
  />
  <main id="app" tabindex="-1">
    <p v-if="!session.ready" class="muted" role="status">
      {{ t("common.loading") }}
    </p>
    <LegalView v-else-if="legalPage" :key="legalPage" :page="legalPage" />
    <ShareView
      v-else-if="route.path === '/share/invite'"
      :token="route.query.get('token') || ''"
    />
    <SocialView v-else-if="route.path === '/social' || route.path.startsWith('/social/')" />
    <AuthView
      v-else-if="!session.user || publicAuth"
      :key="route.path + route.query.toString()"
    />
    <ProfileView v-else-if="route.path === '/profile'" />
    <SpeciesView
      v-else-if="route.path.startsWith('/species')"
      :key="route.path"
    />
    <HealthView v-else-if="route.path === '/health'" :key="route.query.toString()" />
    <AdminView v-else-if="route.path === '/admin' && session.user.isAdmin" />
    <MeasureView
      v-else-if="/^\/a\/[^/]+\/messen$/.test(route.path)"
      :key="route.aquariumId"
      :id="route.aquariumId"
    />
    <AquariumView
      v-else-if="/^\/a\/[^/]+$/.test(route.path)"
      :key="route.aquariumId"
      :id="route.aquariumId"
    />
    <AquariumList v-else />
  </main>
  <SiteFooter :t="t" />
  <FrontendUpdate />
  <div
    id="toast"
    role="status"
    aria-live="polite"
    :class="{ show: notification }"
  >
    {{ notification }}
  </div>
</template>
