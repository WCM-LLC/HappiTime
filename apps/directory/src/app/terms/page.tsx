import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for HappiTime, the venue management platform for Happy Hour marketing.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
        Terms of Service
      </h1>
      <p className="text-sm text-muted mb-10">
        Effective Date: April 20, 2026
      </p>

      <div className="prose">
        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using HappiTime (the &ldquo;Platform&rdquo;),
            operated by Williams Consulting &amp; Management LLC
            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you
            agree to be bound by these Terms of Service. If you do not agree,
            please do not use the Platform.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            HappiTime is a venue management and happy hour marketing platform
            that connects consumers with local venues offering happy hour
            specials and promotions. The Platform includes a public directory
            website, a venue management console, and a mobile application.
          </p>
        </Section>

        <Section title="3. Eligibility">
          <p>
            You must be at least 18 years old to create an account on
            HappiTime. Because the Platform promotes venues that serve
            alcoholic beverages, you must be at least 21 years old to consume
            alcohol at any listed venue in accordance with applicable law. We
            do not sell or facilitate the sale of alcohol.
          </p>
        </Section>

        <Section title="4. Accounts">
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity under your account. You
            agree to provide accurate and complete information when creating an
            account and to update it as needed. We reserve the right to
            suspend or terminate accounts that violate these Terms.
          </p>
        </Section>

        <Section title="5. Venue Operator Terms">
          <p>
            Venue operators who list their establishments on HappiTime are
            responsible for ensuring that all information they provide &mdash;
            including happy hour times, specials, pricing, and venue
            details &mdash; is accurate and up to date. Venue operators are
            solely responsible for compliance with all applicable laws and
            regulations, including liquor licensing and advertising
            requirements.
          </p>
        </Section>

        <Section title="6. Prohibited Conduct">
          <p>You agree not to:</p>
          <ul>
            <li>Use the Platform for any unlawful purpose</li>
            <li>
              Post false, misleading, or fraudulent venue information or
              reviews
            </li>
            <li>
              Attempt to gain unauthorized access to the Platform or its
              systems
            </li>
            <li>
              Interfere with or disrupt the Platform or its infrastructure
            </li>
            <li>Scrape, crawl, or harvest data from the Platform</li>
            <li>Impersonate any person or entity</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All content, trademarks, logos, and intellectual property displayed
            on the Platform are owned by Williams Consulting &amp; Management
            LLC or its licensors. You may not reproduce, distribute, or create
            derivative works from any Platform content without our prior
            written consent.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <p>
            The Platform is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, express or
            implied. We do not warrant that the Platform will be
            uninterrupted, error-free, or free of harmful components. We are
            not responsible for the accuracy of venue listings, pricing, or
            availability of happy hour specials.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Williams Consulting &amp;
            Management LLC shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages arising from your use
            of the Platform. Our total liability for any claim shall not
            exceed the amount you paid us, if any, in the twelve months
            preceding the claim.
          </p>
        </Section>

        <Section title="10. Indemnification">
          <p>
            You agree to indemnify and hold harmless Williams Consulting &amp;
            Management LLC and its officers, directors, employees, and agents
            from any claims, damages, losses, or expenses arising from your
            use of the Platform or violation of these Terms.
          </p>
        </Section>

        <Section title="11. Modifications">
          <p>
            We may update these Terms at any time. We will notify users of
            material changes by posting the revised Terms on the Platform with
            an updated effective date. Your continued use of the Platform
            after changes are posted constitutes acceptance of the revised
            Terms.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the
            laws of the State of Missouri, without regard to conflict of law
            principles. Any disputes arising under these Terms shall be
            resolved in the state or federal courts located in Missouri.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            If you have questions about these Terms, contact us at{" "}
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
