// One connection to the backend's live event stream for the whole app: friends, groups and chats each
// subscribe here instead of opening their own. It connects with the first subscriber and closes with the last.
import { openEventStream, type StreamEvent } from './eventStream';

type Listener = (event: StreamEvent) => void;

const listeners = new Set<Listener>();
let closeStream: (() => void) | null = null;

export const subscribeToLiveEvents = (listener: Listener): (() => void) => {
  listeners.add(listener);
  closeStream ??= openEventStream((event) => listeners.forEach((each) => each(event)));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      closeStream?.();
      closeStream = null;
    }
  };
};
