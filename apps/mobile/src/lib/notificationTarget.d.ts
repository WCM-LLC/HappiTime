// Type declaration for the pure ESM notification-target resolver. The
// implementation lives in notificationTarget.mjs (plain ESM so `node --test`
// can import it directly); this sidecar gives the strict TS build its types
// since tsconfig has allowJs:false.
export type NotificationTarget = {
  screen: string;
  params?: Record<string, unknown>;
};
export function resolveNotificationTarget(data: unknown): NotificationTarget | null;
