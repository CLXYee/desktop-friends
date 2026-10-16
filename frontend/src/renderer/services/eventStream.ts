// The backend's live event stream (Server-Sent Events on /api/events). Read with fetch rather than
// EventSource because EventSource can't send the Authorization header. Reconnects on its own: the backend
// closes streams every 30 minutes, and networks drop.
import { apiUrl } from './api';
import { getAccessToken, refreshSession } from './session';

export interface StreamEvent {
  name: string;
  data: unknown;
}

const MAX_RETRY_DELAY_MS = 30_000;

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
});

/** Splits a stream of SSE text into events ("event:" name, "data:" JSON); comments (keep-alives) are skipped. */
export const parseEventBlock = (block: string): StreamEvent | null => {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0 && name === 'message') return null;
  const text = data.join('\n');
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: hand over the text.
  }
  return { name, data: parsed };
};

const readEvents = async (body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const event = parseEventBlock(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event) onEvent(event);
      end = buffer.indexOf('\n\n');
    }
  }
};

/**
 * Follows the signed-in user's event stream until the returned function is called. The first event of each
 * connection is "ready": anything that changed while disconnected should be reloaded then.
 */
export const openEventStream = (onEvent: (event: StreamEvent) => void): (() => void) => {
  const stop = new AbortController();
  void (async () => {
    let failures = 0;
    while (!stop.signal.aborted) {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch(apiUrl('/events'), {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: stop.signal,
        });
        if (response.status === 401) {
          if (!(await refreshSession())) return;
          continue;
        }
        if (!response.ok || !response.body) throw new Error(`Event stream answered ${response.status}`);
        failures = 0;
        await readEvents(response.body, onEvent);
      } catch {
        if (stop.signal.aborted) return;
        failures += 1;
      }
      // Ended normally (the backend rotates streams): reconnect soon. Failing: back off, up to 30 s.
      await wait(failures === 0 ? 500 : Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** failures), stop.signal);
    }
  })();
  return () => stop.abort();
};
