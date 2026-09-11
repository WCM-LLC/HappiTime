export type GuideBackupFields = Record<string, string>;

export type GuideBackup = {
  fields: GuideBackupFields;
  savedAt: number;
};

export function backupKey(guideId?: string | null): string;
export function buildBackup(fields: GuideBackupFields, savedAt: number): GuideBackup;
export function classifyBackup(
  backup: unknown,
  initialBodyMd: string,
): 'none' | 'stale' | 'restorable';
