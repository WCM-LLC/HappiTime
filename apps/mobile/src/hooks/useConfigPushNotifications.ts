import type { Session } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "../api/supabaseClient";

type PushNotificationState = {
  expoPushToken: string | null;
  permissionStatus: Notifications.PermissionStatus | null;
  lastNotification: Notifications.Notification | null;
  lastResponse: Notifications.NotificationResponse | null;
  error: string | null;
};

const shouldDebug = () => process.env.NODE_ENV === "development";

const getProjectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C"
  });
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

const registerForPushNotificationsAsync = async () => {
  if (!Device.isDevice) {
    return {
      token: null,
      status: null,
      error: "Push notifications require a physical device."
    };
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, status: finalStatus, error: null };
  }

  const projectId = getProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  if (shouldDebug()) {
    console.log("[push] expo token:", tokenResponse.data);
  }

  return { token: tokenResponse.data, status: finalStatus, error: null };
};

const persistPushToken = async (token: string, userId: string) => {
  const payload = {
    user_id: userId,
    expo_push_token: token,
    device_name: Device.deviceName ?? null,
    device_model: Device.modelName ?? null,
    platform: Platform.OS,
    os_name: Device.osName ?? null,
    os_version: Device.osVersion ?? null,
    app_version: Constants.expoConfig?.version ?? null,
    updated_at: new Date().toISOString()
  };

  const { error } = await (supabase as any)
    .from("user_push_tokens")
    .upsert(payload, { onConflict: "user_id,expo_push_token" });

  if (error && shouldDebug()) {
    console.log("[push] failed to save token:", error.message);
  }
};

export function useConfigPushNotifications(session?: Session | null) {
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    permissionStatus: null,
    lastNotification: null,
    lastResponse: null,
    error: null
  });
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    if (!session?.user?.id || hasRegisteredRef.current) return;
    hasRegisteredRef.current = true;
    let cancelled = false;

    const register = async () => {
      try {
        const { token, status, error } =
          await registerForPushNotificationsAsync();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          expoPushToken: token,
          permissionStatus: status,
          error
        }));
      } catch (err: any) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: err?.message ?? "Failed to register for push notifications."
        }));
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const receivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        if (shouldDebug()) {
          console.log(
            "[push] notification received:",
            notification.request.identifier
          );
        }
        setState((prev) => ({ ...prev, lastNotification: notification }));
      });

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        if (shouldDebug()) {
          console.log(
            "[push] notification response:",
            response.notification.request.identifier
          );
        }
        setState((prev) => ({ ...prev, lastResponse: response }));
      });

    let active = true;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active || !response) return;
      setState((prev) => ({ ...prev, lastResponse: response }));
    });

    return () => {
      active = false;
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !state.expoPushToken) return;
    void persistPushToken(state.expoPushToken, session.user.id);
  }, [session?.user?.id, state.expoPushToken]);

  return state;
}
