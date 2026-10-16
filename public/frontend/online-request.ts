import { createApp, watch } from 'vue';
import OnlineRequestNotice from './components/OnlineRequestNotice.vue';
import { session, language } from './state';
import type { Id } from './types';
import { activeOwner, offlineState } from './offline-store';

/** Keep retries in memory only; never persist credentials or replay on reconnect. */
export function retryOnlineRequest(request: () => Promise<Response>, signal: AbortSignal | undefined, mutation: boolean, owner: Id | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    document.body.append(host);
    const message = () => language.value === 'en' ? 'The client is offline. This feature requires a server connection.' : 'Der Client ist gerade offline. Diese Funktion benötigt eine Verbindung zum Server.';
    let finished = false;
    const cleanup = () => {
      finished = true;
      signal?.removeEventListener('abort', cancel);
      window.removeEventListener('hashchange', cancel);
      window.removeEventListener('pagehide', cancel);
      stopWatching();app.unmount();host.remove();
    };
    const cancel = () => { if (!finished) { cleanup();reject(new Error(message())); } };
    const app = createApp(OnlineRequestNotice, {
      mutation,
      cancel,
      async retry() {
        if (finished) return true;
        if (session.user?.id !== owner || (owner && await activeOwner().catch(() => undefined) !== owner)) { cancel();return true; }
        if (finished) return true;
        try {
          const response = await request();
          if (finished) return true;
          offlineState.offline = false;
          cleanup();resolve(response);return true;
        } catch (error) {
          if (signal?.aborted) { cancel();return true; }
          if (!(error instanceof TypeError)) { cleanup();reject(error);return true; }
          offlineState.offline = true;return false;
        }
      },
    });
    const stopWatching = watch(() => session.user?.id, () => cancel(), { flush: 'sync' });
    app.mount(host);
    signal?.addEventListener('abort', cancel, { once: true });
    window.addEventListener('hashchange', cancel, { once: true });
    window.addEventListener('pagehide', cancel, { once: true });
    if (signal?.aborted || session.user?.id !== owner) cancel();
  });
}
