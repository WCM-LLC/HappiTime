// CRM shared constants + pure helpers. No server-only imports — safe everywhere.

export const CRM_STAGES = [
  'new_lead',
  'researched',
  'contacted',
  'responded',
  'demo_scheduled',
  'demo_completed',
  'proposal_sent',
  'pilot_active',
  'won',
  'lost',
  'nurture',
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  new_lead: 'New Lead',
  researched: 'Researched',
  contacted: 'Contacted',
  responded: 'Responded',
  demo_scheduled: 'Demo Scheduled',
  demo_completed: 'Demo Completed',
  proposal_sent: 'Proposal Sent',
  pilot_active: 'Pilot Active',
  won: 'Won',
  lost: 'Lost',
  nurture: 'Nurture',
};

/** Stages counted toward open pipeline value. */
export const CRM_OPEN_STAGES: CrmStage[] = [
  'new_lead', 'researched', 'contacted', 'responded',
  'demo_scheduled', 'demo_completed', 'proposal_sent', 'pilot_active',
];

export const CRM_LOST_REASONS = [
  'no_response', 'not_interested', 'too_expensive', 'bad_fit',
  'timing', 'competitor', 'owner_declined', 'duplicate', 'other',
] as const;

export const CRM_LEAD_SOURCES = [
  'cold_outreach', 'inbound', 'referral', 'event',
  'walk_in', 'directory_import', 'partner', 'other',
] as const;

export const CRM_TIERS = ['listed', 'verified', 'featured', 'bundle', 'founding_pilot'] as const;

export const CRM_TIER_LABELS: Record<(typeof CRM_TIERS)[number], string> = {
  listed: 'Listed (free)',
  verified: 'Verified',
  featured: 'Featured',
  bundle: 'Bundle (multi-venue)',
  founding_pilot: 'Founding Pilot',
};

export const CRM_PRIORITIES = ['low', 'medium', 'high'] as const;

export const CRM_ACTIVITY_TYPES = [
  'call', 'email', 'meeting', 'demo', 'note', 'text',
  'visit', 'proposal_sent', 'objection',
] as const;

export function labelize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`;
}

export function stageBadgeVariant(stage: string): 'success' | 'error' | 'warning' | 'brand' | 'secondary' {
  if (stage === 'won') return 'success';
  if (stage === 'lost') return 'error';
  if (stage === 'pilot_active' || stage === 'proposal_sent') return 'warning';
  if (stage === 'nurture') return 'secondary';
  return 'brand';
}

export type NextActionInput = {
  stage: string;
  next_follow_up_at: string | null;
  openTaskCount: number;
};

/** Rule-based "next best action" — deliberately simple, no LLM required. */
export function nextBestAction(lead: NextActionInput): string {
  if (lead.stage === 'won') return 'Kick off onboarding — confirm listing, menus, and QR assets are live.';
  if (lead.stage === 'lost') return 'Move to nurture later, or archive. Log the lost reason if missing.';
  const followUp = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  if (followUp && followUp.getTime() < Date.now()) return 'Follow-up is overdue — reach out today.';
  if (!followUp && lead.openTaskCount === 0) return 'No follow-up scheduled — schedule one now.';
  switch (lead.stage) {
    case 'new_lead': return 'Research the venue and identify the decision maker.';
    case 'researched': return 'Make first contact (call, email, or walk-in).';
    case 'contacted': return 'Send a second touch — reference their happy hour specifics.';
    case 'responded': return 'Propose a 15-minute demo time.';
    case 'demo_scheduled': return 'Confirm the demo and prep a venue-specific pitch.';
    case 'demo_completed': return 'Send the proposal with tier pricing (mention Founding Pilot).';
    case 'proposal_sent': return 'Follow up on the proposal and surface objections.';
    case 'pilot_active': return 'Share QR scan / check-in data to prove ROI before pilot ends.';
    case 'nurture': return 'Schedule the next periodic touchpoint.';
    default: return 'Review the lead and pick the next step.';
  }
}
