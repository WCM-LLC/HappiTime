import { useCallback, useState } from "react";
import { supabase } from "../api/supabaseClient";

export type ResolvedUser = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type State = {
  loading: boolean;
  error: string | null;
  success: boolean;
};

const INITIAL: State = { loading: false, error: null, success: false };

export function useInviteFriend() {
  const [state, setState] = useState<State>(INITIAL);

  const resolveHandle = useCallback(async (handle: string): Promise<ResolvedUser | null> => {
    const normalized = handle.trim().replace(/^@/, "").toLowerCase();
    if (!normalized) return null;

    const { data } = await (supabase as any)
      .from("user_profiles")
      .select("user_id, handle, display_name, avatar_url, role")
      .eq("handle", normalized)
      .eq("is_public", true)
      .maybeSingle();

    return data as ResolvedUser | null;
  }, []);

  const sendInvite = useCallback(
    async ({ inviteeEmail, inviteeHandle }: { inviteeEmail: string; inviteeHandle?: string }) => {
      setState({ loading: true, error: null, success: false });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState({ loading: false, error: "You must be signed in to send invites.", success: false });
        return false;
      }

      const { data, error } = await supabase.functions.invoke("send-friend-invite", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          invitee_email: inviteeEmail.trim().toLowerCase(),
          invitee_handle: inviteeHandle ?? null,
        },
      });

      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "Failed to send invite. Please try again.";
        setState({ loading: false, error: msg, success: false });
        return false;
      }

      setState({ loading: false, error: null, success: true });
      return true;
    },
    []
  );

  const reset = useCallback(() => setState(INITIAL), []);

  return {
    loading: state.loading,
    error: state.error,
    success: state.success,
    resolveHandle,
    sendInvite,
    reset,
  };
}
