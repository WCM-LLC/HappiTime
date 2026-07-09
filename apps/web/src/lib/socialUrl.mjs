// Normalizes a user-entered social/website URL for safe public rendering.
// Returns { ok:true, value:string|null } (null == cleared) or { ok:false, error }.
export function normalizeSocialUrl(input) {
  const raw = (input ?? "").toString().trim();
  if (!raw) return { ok: true, value: null };

  // Prepend scheme if the user typed a bare domain (no scheme present).
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) links are allowed." };
  }
  // Force https for public display safety.
  url.protocol = "https:";
  if (!url.hostname.includes(".")) {
    return { ok: false, error: "Enter a valid URL." };
  }
  return { ok: true, value: url.toString() };
}
