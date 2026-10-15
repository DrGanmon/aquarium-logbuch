<script setup lang="ts">
import { lazyComponent } from "./composables/lazy-component";
import { computed, onMounted } from "vue";
import OfflineStatus from "./components/OfflineStatus.vue";
import FrontendUpdate from "./components/FrontendUpdate.vue";
import TermsConsent from "./components/TermsConsent.vue";
import Topbar from "./components/Topbar.vue";
import SiteFooter from "./components/SiteFooter.vue";
import { session, language, notification, t } from "./state";
import { route, initialize, toggleLanguage, logout } from "./router";
const AuthView = lazyComponent(() => import("./views/AuthView.vue"));
const SetupView = lazyComponent(() => import("./views/SetupView.vue"));
const AquariumList = lazyComponent(() => import("./views/AquariumList.vue"));
const AquariumView = lazyComponent(() => import("./views/AquariumView.vue"));
const MeasureView = lazyComponent(() => import("./views/MeasureView.vue"));
const ProfileView = lazyComponent(() => import("./views/ProfileView.vue"));
const PlantsView = lazyComponent(() => import("./views/PlantsView.vue"));
const SpeciesView = lazyComponent(() => import("./views/SpeciesView.vue"));
const SocialView = lazyComponent(() => import("./views/SocialView.vue"));
const NotificationsView = lazyComponent(() => import("./views/NotificationsView.vue"));
const HealthView = lazyComponent(() => import("./views/HealthView.vue"));
const AdminView = lazyComponent(() => import("./views/AdminView.vue"));
const LegalView = lazyComponent(() => import("./views/LegalView.vue"));
const ShareView = lazyComponent(() => import("./views/ShareView.vue"));
const legalPage = computed(
  () =>
    (
      ({
        "/agb": "terms",
        "/terms": "terms",
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
    <OfflineStatus v-if="session.user" />
    <p v-if="!session.ready" class="muted" role="status">
      {{ t("common.loading") }}
    </p>
    <SetupView v-else-if="session.setupRequired" />
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
    <NotificationsView v-else-if="route.path === '/notifications'" />
    <PlantsView v-else-if="route.path === '/plants' || route.path.startsWith('/plants/')" :key="route.path" />
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
  <TermsConsent v-if="session.user?.termsRequired" :key="session.user.id" />
  <div
    id="toast"
    role="status"
    aria-live="polite"
    :class="{ show: notification }"
  >
    {{ notification }}
  </div>
</template>
