import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../api/supabaseClient";

/** Parses all query-string and hash fragment key-value pairs from a URL into a flat object. */
function parseAuthParams(url: string) {
  const params: Record<string, string> = {};
  const addParams = (value: string) => {
    if (!value) return;

    for (const part of value.split("&")) {
      if (!part) continue;
      const [rawKey, rawValue = ""] = part.split("=");
      if (!rawKey) continue;
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
    }
  };

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  if (queryIndex !== -1) {
    const queryEnd = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
    addParams(url.slice(queryIndex + 1, queryEnd));
  }

  if (hashIndex !== -1) {
    addParams(url.slice(hashIndex + 1));
  }

  return params;
}

/** Extracts access_token + refresh_token from the URL (token flow — fragment or query). Returns null if either is missing. */
function extractTokenSession(url: string) {
  // Token flow: happitime://auth/callback#access_token=...&refresh_token=...
  // Some tools/providers place those same params in the query string.
  const params = parseAuthParams(url);

  const access_token = params["access_token"];
  const refresh_token = params["refresh_token"];

  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/** Extracts a PKCE auth code from the URL (code flow — query string). Returns null if absent. */
function extractAuthCode(url: string) {
  // PKCE flow: happitime://auth/callback?code=...
  const maybeCode = parseAuthParams(url)["code"];
  return typeof maybeCode === "string" && maybeCode.length > 0 ? maybeCode : null;
}

/** Returns a human-readable error string when the callback URL contains error/error_code params; null otherwise. */
function extractAuthError(url: string) {
  const params = parseAuthParams(url);
  const code = params["error_code"] ?? params["error"];
  const description = params["error_description"];

  if (!code && !description) return null;
  return [code, description].filter(Boolean).join(": ");
}

/** Redacts sensitive auth tokens from a URL before logging to prevent credential leakage in logs. */
function redactUrl(url: string) {
  return url
    .replace(/access_token=[^&#]+/g, "access_token=[redacted]")
    .replace(/refresh_token=[^&#]+/g, "refresh_token=[redacted]")
    .replace(/code=[^&#]+/g, "code=[redacted]");
}

/**
 * Listens for deep link URLs on both cold start and foreground.
 * Handles PKCE code-exchange flow, token-based magic link flow, and auth error logging.
 * Tokens are redacted from all log output.
 */
export function useMagicLinkListener() {
  useEffect(() => {
    const handleUrl = async (url: string) => {
      console.log("Deep link received:", redactUrl(url));

      const authError = extractAuthError(url);
      if (authError) {
        console.log("Auth callback error:", authError);
        return;
      }

      const authCode = extractAuthCode(url);
      if (authCode) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
        console.log("✅ exchangeCodeForSession result:", {
          hasSession: !!data?.session,
          error: error?.message,
        });
        return;
      }

      const tokenSession = extractTokenSession(url);
      if (!tokenSession) {
        console.log("No auth code or tokens found in deep link.");
        return;
      }

      const { access_token, refresh_token } = tokenSession;

      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      console.log("✅ setSession result:", {
        hasSession: !!data?.session,
        error: error?.message,
      });
    };

    // Cold start
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Foreground
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);
}
