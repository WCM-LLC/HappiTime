import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

// NOTE: The user_follows table may not have a `status` column yet. If it doesn't, run this migration:
// -- ALTER TABLE user_follows ADD COLUMN status text DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted'));

export type Follower = {
  follower_id: string;
  created_at: string;
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type PendingRequest = {
  id: string;
  follower_id: string;
  created_at: string;
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type State = {
  followers: Follower[];
  pendingRequests: PendingRequest[];
  loading: boolean;
  error: string | null;
};

export function useUserFollowers() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<State>({
    followers: [],
    pendingRequests: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ followers: [], pendingRequests: [], loading: false, error: null });
      return;
    }

    // Fetch accepted followers
    const { data, error } = await supabase
      .from("user_follows")
      .select("follower_id, created_at, profile:user_profiles!user_follows_follower_id_profile_fkey(handle, display_name, avatar_url)")
      .eq("following_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setState({ followers: [], pendingRequests: [], loading: false, error: error.message });
      return;
    }

    // Try to fetch pending requests (may fail if status column doesn't exist yet)
    let pendingRequests: PendingRequest[] = [];
    const { data: pendingData, error: pendingError } = await supabase
      .from("user_follows")
      .select("id, follower_id, created_at, profile:user_profiles!user_follows_follower_id_profile_fkey(handle, display_name, avatar_url)")
      .eq("following_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!pendingError && pendingData) {
      pendingRequests = pendingData as PendingRequest[];
    }

    setState({
      followers: (data ?? []) as Follower[],
      pendingRequests,
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
    },
    [user?.id]
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
    },
    [user?.id]
  );

  /**
   * Approve an incoming follow request by setting status to 'accepted'.
   */
  const approveFollowRequest = useCallback(
    async (followId: string) => {
      if (!user?.id) return;
      await supabase
        .from("user_follows")
        .update({ status: "accepted" })
        .eq("id", followId);
      await load();
    },
    [user?.id, load]
  );

  /**
   * Reject an incoming follow request by deleting the record.
   */
  const rejectFollowRequest = useCallback(
    async (followId: string) => {
      if (!user?.id) return;
      await supabase
        .from("user_follows")
        .delete()
        .eq("id", followId);
      await load();
    },
    [user?.id, load]
  );

  /**
   * Get pending follow requests where the current user is the target.
   */
  const getPendingRequests = useCallback(async () => {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from("user_follows")
      .select("id, follower_id, created_at, profile:user_profiles!user_follows_follower_id_profile_fkey(handle, display_name, avatar_url)")
      .eq("following_user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) return [];
    return (data ?? []) as PendingRequest[];
  }, [user?.id]);

  return {
    followers: state.followers,
    pendingRequests: state.pendingRequests,
    loading: state.loading,
    error: state.error,
    toggleFollow,
    sendFollowRequest,
    approveFollowRequest,
    rejectFollowRequest,
    getPendingRequests,
    refresh: load,
  };
}
