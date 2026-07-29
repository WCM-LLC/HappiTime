/**
 * Pure logic for the guide editor's localStorage backup.
 *
 * The editor holds the only copy of an author's markdown in client state;
 * any server-action redirect (validation failure, expired session, Submit
 * pressed before a draft row exists) unmounts the form and destroys it.
 * The backup is written on every edit and survives all of those paths.
 *
 * Kept as dependency-free .mjs (repo pattern: kcTime.mjs, notificationTarget.mjs)
 * so `node --test` can exercise the semantics directly.
 */

/** localStorage key, scoped per guide ('new' for an unsaved draft). */
export const backupKey = (guideId) => `ht.guide.backup.${guideId ?? 'new'}`;

/** Snapshot of the form fields plus when it was taken. */
export const buildBackup = (fields, savedAt) => ({ fields: { ...fields }, savedAt });

/**
 * Decide what to do with a persisted backup when the editor mounts:
 *  - 'none'       → nothing usable (absent, empty, or malformed) — ignore/clear
 *  - 'stale'      → body matches what the server already has — clear silently
 *  - 'restorable' → unsaved writing — offer to restore
 */
export function classifyBackup(backup, initialBodyMd) {
  if (!backup || typeof backup !== 'object') return 'none';
  const body = backup.fields?.body_md;
  if (typeof body !== 'string' || body.trim() === '') return 'none';
  if (body === initialBodyMd) return 'stale';
  return 'restorable';
}
