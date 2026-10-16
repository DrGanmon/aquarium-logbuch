import { session, language } from './state';
import { offlineState } from './offline-store';

/** Read application progress separately from the final AI reply. */
export async function chatRequest(path: string, body: unknown, signal: AbortSignal, onStatus: (stage: string) => void): Promise<{ reply: string }> {
  const owner = session.user?.id;
  const request = () => fetch('api' + path, {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', 'X-Language': language.value },
    body: JSON.stringify(body),
  });
  let response: Response;
  try { response = await request(); }
  catch (error) {
    if (!(error instanceof TypeError) || signal.aborted) throw error;
    offlineState.offline = true;
    response = await (await import('./online-request')).retryOnlineRequest(request, signal, true, owner);
  }
  offlineState.offline = false;
  if (!response.ok) {
    if (response.status === 401) session.user = null;
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error(tMissingResponse());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status' && typeof event.stage === 'string') onStatus(event.stage);
        else if (event.type === 'error') throw new Error(event.error);
        else if (event.type === 'done' && typeof event.reply === 'string') return { reply: event.reply };
      }
      if (done) throw new Error(tMissingResponse());
    }
  } catch (error) {
    if (error instanceof TypeError && !signal.aborted) { offlineState.offline = true;throw new Error(tMissingResponse()); }
    throw error;
  } finally { await reader.cancel().catch(() => {});reader.releaseLock(); }
}
function tMissingResponse() { return language.value === 'en' ? 'The AI response was interrupted. Please try again.' : 'Die KI-Antwort wurde unterbrochen. Bitte erneut versuchen.'; }
