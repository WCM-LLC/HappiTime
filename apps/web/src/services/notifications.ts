/**
 * Web notification stubs.
 * requestNotificationPermission is functional. scheduleLocalNotification,
 * cancelLocalNotification, and registerPushToken are stubs pending integration
 * with Expo Notifications or Firebase — see BACKLOG.md.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type LocalNotificationRequest = {
  id?: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  fireDate?: Date;
};

function shouldDebug(): boolean {
  return process.env.NODE_ENV === 'development';
}

/** Requests browser notification permission. Returns current state if already decided. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  if (Notification.permission === 'default') return 'prompt';
  const result = await Notification.requestPermission();
  return result === 'default' ? 'prompt' : result;
}

/** Stub — not yet implemented on web. See BACKLOG.md: "Web push scheduling". */
export async function scheduleLocalNotification(
  _request: LocalNotificationRequest
): Promise<string | null> {
  if (shouldDebug()) console.log('[notifications] scheduleLocalNotification called');
  return null;
}

/** Stub — not yet implemented on web. See BACKLOG.md: "Web push scheduling". */
export async function cancelLocalNotification(_id: string): Promise<void> {
  if (shouldDebug()) console.log('[notifications] cancelLocalNotification called');
}

/** Stub — not yet implemented on web. See BACKLOG.md: "Web push scheduling". */
export async function registerPushToken(): Promise<string | null> {
  if (shouldDebug()) console.log('[notifications] registerPushToken called');
  return null;
}
