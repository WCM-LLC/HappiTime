export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

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

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';

  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }

  if (Notification.permission === 'default') {
    return 'prompt';
  }

  const result = await Notification.requestPermission();
  return result === 'default' ? 'prompt' : result;
}

export async function scheduleLocalNotification(
  _request: LocalNotificationRequest
): Promise<string | null> {
  // TODO: integrate Expo Notifications or native push scheduling in the mobile app.
  if (shouldDebug() && typeof console !== 'undefined') {
    console.log('[notifications] scheduleLocalNotification called');
  }
  return null;
}

export async function cancelLocalNotification(_id: string): Promise<void> {
  // TODO: integrate Expo Notifications or native push scheduling in the mobile app.
  if (shouldDebug() && typeof console !== 'undefined') {
    console.log('[notifications] cancelLocalNotification called');
  }
}

export async function registerPushToken(): Promise<string | null> {
  // TODO: integrate Expo Notifications or Firebase Cloud Messaging.
  if (shouldDebug() && typeof console !== 'undefined') {
    console.log('[notifications] registerPushToken called');
  }
  return null;
}
