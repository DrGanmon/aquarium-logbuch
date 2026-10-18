import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Development identifier; choose an owned identifier before publishing.
  appId: 'de.aquariumlogbuch.prototype',
  appName: 'Aquarium-Logbuch',
  webDir: 'dist/mobile',
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};
export default config;
