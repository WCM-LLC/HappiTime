import * as Crypto from "expo-crypto";
import { bytesToHex } from "./bytesToHex";

/**
 * Returns a fresh Apple Sign-In nonce pair.
 *
 * Apple's replay protection is asymmetric: the SHA-256 *hash* is handed to
 * AppleAuthentication.signInAsync (Apple stamps it into the identity token's
 * `nonce` claim), and the *raw* value is handed to supabase.auth.signInWithIdToken
 * (GoTrue hashes its copy and compares to the claim). Passing the same value to
 * both — the 2026-06-08 bug — can never match.
 */
export async function makeAppleNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32); // 256-bit CSPRNG
  const raw = bytesToHex(bytes);
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );
  return { raw, hashed };
}
