// packages/shared-types/src/index.ts
export * from "./reserved-handles.js";

// Import the generated Supabase Database type
import type { Database as SupabaseDatabase } from "../../supabase/types/generated.js";

// Re-export the raw Database type
export type Database = SupabaseDatabase;

// Domain aliases for convenience
export type Venue = Database["public"]["Tables"]["venues"]["Row"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type HappyHourWindow = Database["public"]["Tables"]["happy_hour_windows"]["Row"];
export type HappyHourOffer = Database["public"]["Tables"]["happy_hour_offers"]["Row"];
export type Menu = Database["public"]["Tables"]["menus"]["Row"];
export type MenuSection = Database["public"]["Tables"]["menu_sections"]["Row"];
export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type VenueMedia = Database["public"]["Tables"]["venue_media"]["Row"];
export type VenueEvent = Database["public"]["Tables"]["venue_events"]["Row"];
export type ApprovedTag = Database["public"]["Tables"]["approved_tags"]["Row"];
export type VenueTag = Database["public"]["Tables"]["venue_tags"]["Row"];
export type EventMedia = Database["public"]["Tables"]["event_media"]["Row"];
export type OrgInvite = Database["public"]["Tables"]["org_invites"]["Row"];
export type OrgMember = Database["public"]["Tables"]["org_members"]["Row"];
export type VenueMember = Database["public"]["Tables"]["venue_members"]["Row"];

// User / social layer
export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
export type UserPreference = Database["public"]["Tables"]["user_preferences"]["Row"];
export type UserFollow = Database["public"]["Tables"]["user_follows"]["Row"];
export type UserList = Database["public"]["Tables"]["user_lists"]["Row"];

// ── Guide + Invite types ─────────────────────────────────────────────────────
// Hand-written until `npm run supabase:gen-types` re-runs against the DB that
// has migration 20260518120000_super_users_and_guides applied.
// Replace with Database["public"]["Tables"]["guides"]["Row"] etc. after regen.

export type GuideStatus = "draft" | "pending_review" | "published" | "archived";
export type UserRole = "user" | "super_user";
export type InviteStatus = "pending" | "claimed" | "expired" | "cancelled";
export type SubmissionDecision = "approved" | "rejected" | "unpublished";

export type Guide = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  body_md: string;
  author_id: string | null;
  status: GuideStatus;
  city: string | null;
  neighborhood: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GuideSubmission = {
  id: string;
  guide_id: string;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision: SubmissionDecision | null;
  notes: string | null;
};

export type PendingFriendInvite = {
  id: string;
  inviter_id: string;
  invitee_handle: string | null;
  invitee_email: string;
  status: InviteStatus;
  invite_token: string;
  created_at: string;
  claimed_at: string | null;
  expires_at: string;
};
