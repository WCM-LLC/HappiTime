import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HappiTime App — Coming Soon",
  description:
    "The HappiTime mobile app is coming soon. Get notified when happy hour starts, save your favorites, and find deals near you.",
};

export default function AppComingSoonPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
        {/* Left — text content */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-4 py-1.5 text-sm font-semibold text-brand mb-6">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            Coming Soon
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Happy hour,
            <br />
            in your pocket.
          </h1>
          <p className="text-lg text-muted max-w-md mx-auto lg:mx-0 mb-8">
            The HappiTime app is almost here. Save your favorite spots, get
            notified when deals start, and never miss a happy hour again.
          </p>

          {/* Email signup */}
          <form
            action="https://happitime.biz/contactus"
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0"
          >
            <div className="flex-1">
              <label htmlFor="notify-email" className="sr-only">
                Email address
              </label>
              <input
                id="notify-email"
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-full border border-border bg-surface px-5 py-3 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-brand px-6 py-3 text-white font-semibold text-sm hover:bg-brand-dark transition-colors shrink-0"
            >
              Notify Me
            </button>
          </form>
          <p className="text-xs text-muted mt-3">
            We&rsquo;ll let you know the moment it&rsquo;s live. No spam.
          </p>
        </div>

        {/* Right — phone mockup */}
        <div className="shrink-0">
          <div className="relative w-[280px] h-[560px]">
            {/* Phone frame */}
            <div className="absolute inset-0 rounded-[3rem] border-[6px] border-foreground/10 bg-surface shadow-2xl overflow-hidden">
              {/* Status bar */}
              <div className="h-12 bg-background flex items-center justify-center">
                <div className="w-24 h-5 rounded-full bg-foreground/10" />
              </div>

              {/* Screen content */}
              <div className="px-5 pt-4">
                {/* App header */}
                <div className="flex items-center justify-between mb-6">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 439 148"
                    className="h-5"
                    aria-hidden="true"
                  >
                    <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
                    <text
                      x="30"
                      y="93.0"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontWeight="800"
                      fontSize="72"
                      letterSpacing="-0.02em"
                    >
                      <tspan fill="#1A1A1A">Happ</tspan>
                      <tspan fill="#FFFFFF">iTi</tspan>
                      <tspan fill="#1A1A1A">me</tspan>
                    </text>
                  </svg>
                  <div className="w-8 h-8 rounded-full bg-brand-subtle" />
                </div>

                {/* Search bar mock */}
                <div className="rounded-xl bg-background border border-border px-4 py-3 mb-5">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-muted"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                      />
                    </svg>
                    <span className="text-xs text-muted-light">
                      Search happy hours...
                    </span>
                  </div>
                </div>

                {/* Day chips */}
                <div className="flex gap-1.5 mb-5 overflow-hidden">
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                    <div
                      key={d}
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                        i === 2
                          ? "bg-brand text-white"
                          : "bg-background border border-border text-muted"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Venue cards mock */}
                {[
                  { name: "The Peanut", time: "3-6 PM", tag: "$4 Wells" },
                  { name: "Char Bar", time: "4-6 PM", tag: "$5 Margs" },
                  { name: "Gram & Dun", time: "3-6 PM", tag: "$6 Apps" },
                ].map((v) => (
                  <div
                    key={v.name}
                    className="rounded-xl border border-border bg-background p-3 mb-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {v.name}
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">
                          {v.time}
                        </p>
                      </div>
                      <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[9px] font-semibold text-brand">
                        {v.tag}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom nav */}
              <div className="absolute bottom-0 inset-x-0 h-16 border-t border-border bg-surface flex items-center justify-around px-6">
                {["Explore", "Map", "Saved", "Profile"].map((tab, i) => (
                  <div key={tab} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-5 h-5 rounded-md ${
                        i === 0 ? "bg-brand" : "bg-foreground/10"
                      }`}
                    />
                    <span
                      className={`text-[9px] font-medium ${
                        i === 0 ? "text-brand" : "text-muted-light"
                      }`}
                    >
                      {tab}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
