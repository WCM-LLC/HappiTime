/**
 * Who gets credit for a piece of Happy Hour content.
 *
 * The tier is written ALONGSIDE created_by and never recomputed. Roles change
 * — a super user who later joins an org as an owner must not retroactively
 * change how their past contributions are counted — so the value stored here
 * is a snapshot of the contributor at the moment they contributed.
 *
 * This union must stay in lockstep with the created_by_tier CHECK constraint
 * in 20260813180000_contribution_attribution.sql. A value outside the
 * constraint fails the insert with a 23514 at write time.
 */
export type ContributorTier = 'admin' | 'owner' | 'super_user' | 'user';

/** The user and tier recorded on a contribution. */
export type Contributor = { id: string; tier: ContributorTier };

/**
 * The tier for a console (server-action) writer.
 *
 * Only two are reachable here. Super users have no console write path — they
 * contribute through intake, which always drafts for review — and regular
 * users cannot contribute at all yet (getIntakeTier returns null for them).
 */
export function consoleContributorTier(isPlatformAdmin: boolean): ContributorTier {
  return isPlatformAdmin ? 'admin' : 'owner';
}
