'use strict';

import { initApp, start } from './js/router.js';
import { showAuth } from './js/views/auth.js';

// Re-export core modules and views for modular extensibility
export * from './js/state.js';
export * from './js/dom.js';
export * from './js/api.js';
export * from './js/utils.js';
export * from './js/theme.js';
export * from './js/notifications.js';
export * from './js/charts.js';
export * from './js/views/auth.js';
export * from './js/views/legal.js';
export * from './js/views/species.js';
export * from './js/views/ai-chat.js';
export * from './js/views/aquarium-list.js';
export * from './js/views/aquarium-detail.js';
export * from './js/views/measure.js';
export * from './js/views/timeline.js';
export * from './js/views/export-import.js';
export * from './js/views/profile.js';
export * from './js/views/admin.js';
export * from './js/router.js';

// App initialisieren und starten
initApp();
(async () => {
  try {
    await start();
  } catch (e) {
    showAuth();
  }
})();
