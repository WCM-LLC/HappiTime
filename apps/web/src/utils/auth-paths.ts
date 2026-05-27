export const GUIDE_AUTHORING_PATH = '/dashboard/guides';
export const GUIDE_EDITOR_PATH = '/dashboard/guides/new';
export const LOGIN_PATH = '/login';
export const SUPER_USER_LOGIN_PATH = '/super-user/login';

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return null;
  if (value === SUPER_USER_LOGIN_PATH || value.startsWith(`${SUPER_USER_LOGIN_PATH}?`)) return null;
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
  const basePath = isGuideAuthoringPath(safeNext) ? SUPER_USER_LOGIN_PATH : LOGIN_PATH;

  if (safeNext) params.set('next', safeNext);
  if (error) params.set('error', error);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
