import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for HappiTime, the venue management platform for Happy Hour marketing.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted mb-10">
        Effective Date: April 20, 2026
      </p>

      <div className="prose">
        <Section title="1. Introduction">
          <p>
            Williams Consulting &amp; Management LLC (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates HappiTime (the
            &ldquo;Platform&rdquo;), including the website at happitime.biz,
            the venue management console, and the mobile application. This
            Privacy Policy explains how we collect, use, share, and protect
            your personal information.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Account Information
          </h3>
          <p>
            When you create an account, we collect your name, email address,
            and authentication credentials. If you sign in through Google or
            Apple, we receive your name and email from those services.
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Venue Information
          </h3>
          <p>
            Venue operators provide business details including venue name,
            address, hours of operation, happy hour schedules, specials, and
            contact information. This information is displayed publicly on the
            Platform.
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Automatic Information
          </h3>
          <p>
            We automatically collect usage data including pages visited,
            features used, device type, browser type, IP address, and
            approximate location. We use Vercel Analytics to collect
            aggregated, privacy-friendly website analytics.
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Third-Party Sources
          </h3>
          <p>
            We may receive information from authentication providers (Google,
            Apple) when you choose to sign in using their services.
          </p>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul>
            <li>Provide, maintain, and improve the Platform</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Display venue listings and happy hour information</li>
            <li>
              Send transactional communications (password resets, account
              updates)
            </li>
            <li>Analyze usage trends to improve the user experience</li>
            <li>Enforce our Terms of Service and prevent fraud</li>
            <li>Comply with legal obligations</li>
          </ul>
        </Section>

        <Section title="4. How We Share Your Information">
          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Public Listings
          </h3>
          <p>
            Venue information submitted by operators is displayed publicly on
            the Platform and may be indexed by search engines.
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Service Providers
          </h3>
          <p>
            We share data with trusted service providers who help us operate
            the Platform, including Supabase (database and authentication),
            Vercel (hosting and analytics), and Google and Apple (OAuth
            authentication).
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Legal Requirements
          </h3>
          <p>
            We may disclose your information if required by law, legal
            process, or government request, or to protect the rights, safety,
            or property of our users or the public.
          </p>

          <h3 className="font-semibold text-foreground mt-4 mb-2">
            Business Transfers
          </h3>
          <p>
            In the event of a merger, acquisition, or sale of assets, your
            information may be transferred as part of that transaction. We
            will notify you of any such change.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <p>
            We retain your personal information for as long as your account is
            active or as needed to provide services. If you request account
            deletion, we will remove your personal data within 30 days, except
            where retention is required by law.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            We implement industry-standard security measures to protect your
            information, including encrypted data transmission (TLS),
            encrypted passwords, and secure infrastructure through our hosting
            providers. However, no system is completely secure, and we cannot
            guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Update or correct inaccurate information</li>
            <li>Request deletion of your account and personal data</li>
            <li>Opt out of non-essential communications</li>
            <li>Manage cookie preferences through your browser settings</li>
          </ul>
          <p>
            To exercise these rights, contact us at{" "}
            <a
              href="mailto:admin@happitime.biz"
              className="text-brand hover:text-brand-dark underline underline-offset-4 transition-colors"
            >
              admin@happitime.biz
            </a>
            .
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            The Platform is not directed at children under 13. We do not
            knowingly collect personal information from children under 13. If
            we learn we have collected such information, we will delete it
            promptly.
          </p>
        </Section>

        <Section title="9. California Privacy Rights (CCPA)">
          <p>
            If you are a California resident, you have additional rights under
            the California Consumer Privacy Act, including the right to know
            what personal information we collect and how it is used, the right
            to request deletion, and the right to opt out of the sale of
            personal information. We do not sell your personal information.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will
            notify users of material changes by posting the revised policy on
            the Platform with an updated effective date. Your continued use of
            the Platform after changes are posted constitutes acceptance.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have questions about this Privacy Policy, contact us at{" "}
            <a
              href="mailto:admin@happitime.biz"
              className="text-brand hover:text-brand-dark underline underline-offset-4 transition-colors"
            >
              admin@happitime.biz
            </a>
            .
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <div className="text-[15px] leading-relaxed text-muted space-y-3">
        {children}
      </div>
    </section>
  );
}
