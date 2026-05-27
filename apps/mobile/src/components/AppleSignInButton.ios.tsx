import * as AppleAuthentication from "expo-apple-authentication";
import { StyleSheet } from "react-native";
import { supabase } from "../api/supabaseClient";
import { spacing } from "../theme/spacing";

type AppleSignInButtonProps = {
  disabled?: boolean;
  onStatusMessage: (message: string | null) => void;
};

function makeNonce(length = 32) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const values = new Uint8Array(length);
  const webCrypto = (globalThis as {
    crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
  }).crypto;

  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function AppleSignInButton({
  disabled,
  onStatusMessage,
}: AppleSignInButtonProps) {
  const handleAppleSignIn = async () => {
    if (disabled) return;

    try {
      const nonce = makeNonce();
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        onStatusMessage("Apple sign-in failed: no identity token received.");
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce,
      });

      if (error) {
        console.error("Supabase Apple auth error:", error);
        onStatusMessage(`Auth error: ${error.message}`);
      }
    } catch (err: any) {
      if (err.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      console.error("Apple sign-in error:", err);
      onStatusMessage(err?.message ?? "Unexpected error during Apple sign-in");
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={999}
      style={[styles.appleButton, disabled && styles.disabled]}
      onPress={handleAppleSignIn}
    />
  );
}

const styles = StyleSheet.create({
  appleButton: {
    width: "100%",
    height: 50,
    marginBottom: spacing.md,
  },
  disabled: {
    opacity: 0.6,
  },
});
