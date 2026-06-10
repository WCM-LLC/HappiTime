import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublicProfileByHandle } from "@/lib/queries";
import { ReferralLandingClient } from "./ReferralLandingClient";

// Referral / Insider landing: https://happitime.biz/r/{handle}
// A new user arriving via an Insider's personal link lands here. The client
// component attempts to open the native app (happitime://referral/{handle}).
// Referral capture itself happens in-app after install/sign-in — this page
// only shows who invited you and routes to the stores.

export const dynamic = "force-dynamic";

const APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
const PLAY_STORE_URL = "https://play.google.com/store/apps/happitime";

type Props = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfileByHandle(handle);
  const name = profile?.display_name ?? `@${handle}`;
  return {
    title: `Join HappiTime — invited by ${name}`,
    description: `${name} invited you to HappiTime, the happy-hour layer on top of Google.`,
    robots: { index: false, follow: false }, // utility landing, not for search indexing
  };
}

export default async function ReferralLandingPage({ params }: Props) {
  const { handle } = await params;
  const profile = await getPublicProfileByHandle(handle);
  if (!profile) notFound();

  const displayName = profile.display_name ?? `@${profile.handle}`;
  const appDeepLink = `happitime://referral/${profile.handle}`;

  return (
    <main className="min-h-screen bg-[#F5F0EB] px-4 py-12">
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-[#E5E0D8] bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C8965A]">
            HappiTime
          </p>

          {/* Inviter avatar / initials */}
          <div className="mt-4 flex justify-center">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={displayName}
                width={64}
                height={64}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5EDE3]">
                <span className="text-2xl font-bold text-[#C8965A]">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-bold text-[#1A1A1A]">
            Join HappiTime
          </h1>
          <p className="mt-1 text-sm text-[#6B6B6B]">
            Invited by <span className="font-semibold text-[#1A1A1A]">{displayName}</span>
          </p>
          <p className="mt-1 text-xs text-[#9CA3AF]">@{profile.handle}</p>

          <p className="mt-4 text-sm text-[#6B6B6B]">
            The happy-hour layer on top of Google — surfacing what Google buries.
          </p>

          <ReferralLandingClient
            handle={profile.handle}
            appDeepLink={appDeepLink}
            appStoreUrl={APP_STORE_URL}
            playStoreUrl={PLAY_STORE_URL}
          />
        </div>

        <p className="mt-4 text-center text-xs text-[#6B6B6B]">
          Already have the app? Open it and sign in — your referral is saved automatically.
        </p>
      </section>
    </main>
  );
}
