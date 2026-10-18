import '../style.css';
import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import MobileLauncher from './components/MobileLauncher.vue';
import { installServerTransport } from './mobile-runtime';

const launcher = createApp(MobileLauncher, {
  native: Capacitor.isNativePlatform(),
  async onConnect(server: string) {
    installServerTransport(server);
    launcher.unmount();
    try { await import('./main'); }
    catch {
      const root = document.querySelector('#vue-root');
      if (root) root.textContent = 'Die App konnte nicht gestartet werden. Bitte die App neu öffnen.';
    }
  },
});
launcher.mount('#vue-root');
