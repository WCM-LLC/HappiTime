import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claim Your Venue — List Your Happy Hour on HappiTime",
  description:
    "Own a bar or restaurant? Claim your venue on HappiTime and manage your happy hour listings. New business launch — 50% off for the first 3 months.",
};

export default function ClaimPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted mb-8 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">Claim Your Venue</span>
      </nav>

      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-4 py-1.5 text-sm font-semibold text-brand mb-6">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          Launch Special — 50% Off
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
          Is this your place?
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto">
          Claim your venue on HappiTime and put your happy hour in front of
          thousands of locals looking for their next spot.
        </p>
      </div>

      {/* Promo card */}
      <div className="rounded-2xl border-2 border-brand bg-brand-subtle/30 p-8 mb-12 text-center">
        <h2 className="text-2xl font-extrabold text-foreground mb-3">
          50% off for the first 3 months
        </h2>
        <p className="text-muted max-w-md mx-auto mb-1">
          We&rsquo;re a new business and we want to grow with you. Sign up now
          and lock in half-price for your first three months &mdash; no
          commitment after that.
        </p>
      </div>

      {/* What you get */}
      <div className="mb-12">
        <h2 className="text-xl font-bold text-foreground mb-6 text-center">
          What you get
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: (
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              ),
              title: "Manage Your Listing",
              desc: "Update your hours, menus, deals, and photos anytime from our venue console.",
            },
            {
              icon: (
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              ),
              title: "Reach More Customers",
              desc: "Get discovered by happy hour seekers across Kansas City who are ready to walk in.",
            },
            {
              icon: (
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              ),
              title: "Promoted Placement",
              desc: "Subscribers get priority placement in search results and neighborhood pages.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-surface p-6 text-center"
            >
              <div className="flex justify-center mb-3">{item.icon}</div>
              <h3 className="font-bold text-foreground mb-1">{item.title}</h3>
              <p className="text-sm text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl bg-brand-subtle p-10 text-center">
        <h2 className="text-2xl font-extrabold text-foreground mb-3">
          Ready to get started?
        </h2>
        <p className="text-muted mb-6 max-w-md mx-auto">
          Schedule a quick call with our team. We&rsquo;ll walk you through
          everything and get your venue set up in minutes.
        </p>
        <a
          href="https://happitime.biz/contactus"
          className="inline-block rounded-full bg-brand px-8 py-3 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Set Up a Call
        </a>
        <p className="text-xs text-muted mt-4">
          Or email us directly at{" "}
          <a
            href="mailto:hello@happitime.biz"
            className="text-brand font-medium hover:underline"
          >
            hello@happitime.biz
          </a>
        </p>
      </div>
    </div>
  );
}
