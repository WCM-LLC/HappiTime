export const GUIDE_AUTHORING_PATH = '/dashboard/guides';
export const LOGIN_PATH = '/login';

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return null;
  return value;
}

export function isGuideAuthoringPath(value: string | null | undefined) {
  const safePath = safeNextPath(value);
  if (!safePath) return false;

  const pathname = safePath.split(/[?#]/, 1)[0];
  return pathname === GUIDE_AUTHORING_PATH || pathname.startsWith(`${GUIDE_AUTHORING_PATH}/`);
}

export function loginPathFor(next?: string | null, error?: string | null) {
  const params = new URLSearchParams();
  const safeNext = safeNextPath(next);

  if (safeNext) params.set('next', safeNext);
  if (error) params.set('error', error);

  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}
