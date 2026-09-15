import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

// user_follows.status is live in prod: 'accepted' (default) | 'pending'.
// RLS lets a user read rows where they are follower OR target, so both
// directions below are readable with the user's own session.

export type Follower = {
  follower_id: string;
  created_at: string;
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
};

export type PendingRequest = {
  follower_id: string;
  created_at: string;
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
};

export type Following = {
  following_user_id: string;
  created_at: string;
  status: "accepted" | "pending";
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
};

type State = {
  followers: Follower[];
  pendingRequests: PendingRequest[];
  following: Following[];      // accepted, people I follow
  sentRequests: Following[];   // pending, requests I've sent
  loading: boolean;
  error: string | null;
};

const FOLLOWER_PROFILE = "profile:user_profiles!user_follows_follower_id_profile_fkey(handle, display_name, avatar_url, role)";
const FOLLOWING_PROFILE = "profile:user_profiles!user_follows_following_user_id_profile_fkey(handle, display_name, avatar_url, role)";

export function useUserFollowers() {
  const { user } = useCurrentUser();
  const empty: State = {
    followers: [],
    pendingRequests: [],
    following: [],
    sentRequests: [],
    loading: true,
    error: null,
  };
  const [state, setState] = useState<State>(empty);

  // 2026-09-14: this hook only ever loaded "people who follow me" (and did so
  // without a status filter, so pending requests showed up as followers), and
  // nothing anywhere loaded "people I follow". The Friends tab therefore
  // could not show either list. Both directions now load in one pass.
  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ ...empty, loading: false });
      return;
    }

    const [inbound, outbound] = await Promise.all([
      (supabase as any)
        .from("user_follows")
        .select(`follower_id, created_at, status, ${FOLLOWER_PROFILE}`)
        .eq("following_user_id", user.id)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("user_follows")
        .select(`following_user_id, created_at, status, ${FOLLOWING_PROFILE}`)
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const err = inbound.error ?? outbound.error;
    if (err) {
      setState({ ...empty, loading: false, error: err.message });
      return;
    }

    const inRows = (inbound.data ?? []) as (Follower & { status: string })[];
    const outRows = (outbound.data ?? []) as Following[];

    setState({
      followers: inRows.filter((r) => r.status === "accepted"),
      pendingRequests: inRows.filter((r) => r.status === "pending") as PendingRequest[],
      following: outRows.filter((r) => r.status === "accepted"),
      sentRequests: outRows.filter((r) => r.status === "pending"),
      loading: false,
      error: null,
    });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = useCallback(
    async (targetUserId: string, currentlyFollowing: boolean) => {
      if (!user?.id) return;
      if (currentlyFollowing) {
        await supabase
          .from("user_follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_user_id", targetUserId);
      } else {
        await supabase.from("user_follows").insert({
          follower_id: user.id,
          following_user_id: targetUserId,
        });
      }
      await load();
    },
    [user?.id, load]
  );

  /** Unfollow someone, or withdraw a pending request you sent. Same row either way. */
  const unfollow = useCallback(
    async (targetUserId: string) => {
      if (!user?.id) return;
      await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_user_id", targetUserId);
      await load();
    },
    [user?.id, load]
  );

  /**
   * Send a follow request. Inserts with status: 'pending'.
   * If the status column doesn't exist yet, falls back to a normal insert.
   */
  const sendFollowRequest = useCallback(
    async (targetUserId: string) => {
      if (!user?.id) return;
      const { error } = await supabase.from("user_follows").insert({
        follower_id: user.id,
        following_user_id: targetUserId,
        status: "pending",
      });

      if (error) {
        // Fallback: status column may not exist, insert without it
        await supabase.from("user_follows").insert({
          follower_id: user.id,
          following_user_id: targetUserId,
        });
      }
      await load();
    },
    [user?.id, load]
  );

  /**
   * Approve an incoming follow request by setting status to 'accepted'.
   */
  const approveFollowRequest = useCallback(
    async (followerId: string) => {
      if (!user?.id) return;
      await supabase
        .from("user_follows")
        .update({ status: "accepted" })
        .eq("follower_id", followerId)
        .eq("following_user_id", user.id);
      await load();
    },
    [user?.id, load]
  );

  /**
   * Reject an incoming follow request by deleting the record.
   */
  const rejectFollowRequest = useCallback(
    async (followerId: string) => {
      if (!user?.id) return;
      await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_user_id", user.id);
      await load();
    },
    [user?.id, load]
  );

  /**
   * Get pending follow requests where the current user is the target.
   */
  const getPendingRequests = useCallback(async () => {
    if (!user?.id) return [];
    const { data, error } = await (supabase as any)
      .from("user_follows")
      .select("follower_id, created_at, profile:user_profiles!user_follows_follower_id_profile_fkey(handle, display_name, avatar_url, role)")
      .eq("following_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) return [];
    return (data ?? []) as PendingRequest[];
  }, [user?.id]);

  return {
    followers: state.followers,
    pendingRequests: state.pendingRequests,
    following: state.following,
    sentRequests: state.sentRequests,
    loading: state.loading,
    error: state.error,
    toggleFollow,
    unfollow,
    sendFollowRequest,
    approveFollowRequest,
    rejectFollowRequest,
    getPendingRequests,
    refresh: load,
  };
}
