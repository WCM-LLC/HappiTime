export const GUIDE_AUTHORING_PATH = '/dashboard/guides';
export const GUIDE_EDITOR_PATH = '/dashboard/guides/new';
// Where a Super User lands after signing in: their Home at /dashboard (which
// branches on role), not the guide editor. An explicit ?next= still wins.
export const SUPER_USER_HOME_PATH = '/dashboard';
export const METRICS_PATH = '/dashboard/metrics';
export const REFERRALS_PATH = '/dashboard/referrals';
export const PROFILE_PATH = '/dashboard/profile';
export const EVENTS_PATH = '/dashboard/events';
export const LOGIN_PATH = '/login';
export const SUPER_USER_LOGIN_PATH = '/super-user/login';

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return null;
  if (value === SUPER_USER_LOGIN_PATH || value.startsWith(`${SUPER_USER_LOGIN_PATH}?`)) return null;
  return value;
}

// Paths gated to role='super_user' (or platform admin). Despite the legacy
// name, this covers the whole Super User console: guide authoring, referrals,
// profile, and proposed events.
const SUPER_USER_PATHS = [GUIDE_AUTHORING_PATH, REFERRALS_PATH, PROFILE_PATH, EVENTS_PATH, METRICS_PATH];

export function isGuideAuthoringPath(value: string | null | undefined) {
  const safePath = safeNextPath(value);
  if (!safePath) return false;

  const pathname = safePath.split(/[?#]/, 1)[0];
  return SUPER_USER_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

// A `next` the Super User login may send someone to: any Super User page, or
// the role-branched Home. Used by the Super User login page and magic-link send.
export function isSuperUserNextPath(value: string | null | undefined) {
  const safePath = safeNextPath(value);
  if (!safePath) return false;
  const pathname = safePath.split(/[?#]/, 1)[0];
  return pathname === SUPER_USER_HOME_PATH || isGuideAuthoringPath(safePath);
}

export function loginPathFor(next?: string | null, error?: string | null) {
  const params = new URLSearchParams();
  const safeNext = safeNextPath(next);
  const basePath = isGuideAuthoringPath(safeNext) ? SUPER_USER_LOGIN_PATH : LOGIN_PATH;

  if (safeNext) params.set('next', safeNext);
  if (error) params.set('error', error);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
