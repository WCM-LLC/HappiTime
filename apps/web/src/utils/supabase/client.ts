import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@happitime/shared-env";
import posthog from 'posthog-js';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

function syncPostHogIdentity(
  event: string,
  user: { id: string; email?: string | null } | null,
) {
  if (user) {
    posthog.identify(user.id, { email: user.email ?? undefined });
  } else if (event === 'SIGNED_OUT') {
    posthog.reset();
  }
}

export function createClient() {
  if (browserClient) return browserClient;

  const { url, anonKey } = getPublicSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  void browserClient.auth.getUser().then(({ data }) =>
    syncPostHogIdentity('INITIAL_SESSION', data.user),
  );
  browserClient.auth.onAuthStateChange((event, session) =>
    syncPostHogIdentity(event, session?.user ?? null),
  );

  return browserClient;
}
