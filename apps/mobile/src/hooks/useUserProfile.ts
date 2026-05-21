import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

type UserProfile = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  role: string;
};

const normalizeText = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeHandle = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export function useUserProfile() {
  const { user } = useCurrentUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("user_profiles")
      .select("user_id, handle, display_name, avatar_url, bio, is_public, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setError(error);
      setProfile(null);
    } else {
      setError(null);
      setProfile(data ?? null);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = useCallback(
    async (updates: {
      display_name?: string | null;
      handle?: string | null;
      bio?: string | null;
      avatar_url?: string | null;
      is_public?: boolean;
    }) => {
      if (!user?.id) {
        return { data: null, error: new Error("Not signed in.") };
      }

      setSaving(true);
      // Only include fields that were explicitly passed — omitting a key
      // entirely prevents the upsert from overwriting unrelated columns with null.
      const payload: Record<string, unknown> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      if ("display_name" in updates) payload.display_name = normalizeText(updates.display_name);
      if ("handle" in updates) payload.handle = normalizeHandle(updates.handle);
      if ("bio" in updates) payload.bio = normalizeText(updates.bio);
      if ("avatar_url" in updates) payload.avatar_url = updates.avatar_url ?? null;
      if ("is_public" in updates) payload.is_public = updates.is_public;

      const { data, error } = await (supabase as any)
        .from("user_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id, handle, display_name, avatar_url, bio, is_public, role")
        .maybeSingle();

      if (error) {
        setError(error);
      } else {
        setError(null);
        setProfile(data ?? null);
      }
      setSaving(false);
      return { data: data ?? null, error };
    },
    [user?.id]
  );

  return { profile, loading, saving, error, refresh: load, saveProfile };
}
