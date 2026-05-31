// supabase/functions/_shared/expo-push.ts
//
// One Expo push sender, shared across the edge functions. Batches at Expo's
// 100-messages-per-request limit, POSTs to exp.host, logs failures, and never
// throws to the caller. Returns the count accepted by Expo.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else console.error("[expo-push] send failed:", await res.text());
    } catch (err) {
      console.error("[expo-push] send error:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
