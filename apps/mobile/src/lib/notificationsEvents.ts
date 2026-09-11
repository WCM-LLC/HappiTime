// src/lib/notificationsEvents.ts
//
// Module-singleton signal connecting the inbox (which marks rows read) to the
// tab badge in AppNavigator, which lives outside the screen tree.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnreadChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitUnreadChanged(): void {
  listeners.forEach((fn) => fn());
}
