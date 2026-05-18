import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";

const BUCKET = "user-avatars";
const MAX_DIMENSION = 512;

export type AvatarUploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; url: string }
  | { status: "error"; message: string };

export function useAvatarUpload() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<AvatarUploadState>({ status: "idle" });

  const pickAndUpload = useCallback(async (): Promise<string | null> => {
    if (!user?.id) {
      setState({ status: "error", message: "You must be signed in to upload a photo." });
      return null;
    }

    // Request permission (required on Android; iOS prompts automatically)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setState({ status: "error", message: "Photo library access is required to set an avatar." });
      return null;
    }

    // Open picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) {
      setState({ status: "idle" });
      return null;
    }

    setState({ status: "uploading" });

    try {
      const asset = result.assets[0];

      // Resize + compress with ImageManipulator
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Fetch as blob for upload
      const response = await fetch(manipResult.uri);
      const blob = await response.blob();

      // Upload to user-avatars/{userId}/avatar.jpg (upsert overwrites previous)
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadError) {
        setState({ status: "error", message: uploadError.message });
        return null;
      }

      // Bust the CDN cache with a timestamp query param
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;

      setState({ status: "success", url });
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setState({ status: "error", message });
      return null;
    }
  }, [user?.id]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, pickAndUpload, reset };
}
