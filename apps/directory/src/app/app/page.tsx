import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HappiTime — Available on iPhone | Android Coming Soon",
  description:
    "Download HappiTime free on the App Store. Get notified when happy hour starts, save your favorites, and find deals near you. Android coming soon.",
};

export default function AppComingSoonPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
        {/* Left — text content */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-4 py-1.5 text-sm font-semibold text-brand mb-6">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            HappiTime for Android Coming Soon
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Happy hour,
            <br />
            in your pocket.
          </h1>
          <p className="text-lg text-muted max-w-md mx-auto lg:mx-0 mb-8">
            HappiTime is live on iPhone. Save your favorite spots, get notified
            when deals start, and never miss a happy hour again.
          </p>

          {/* iOS App Store button */}
          <a
            href="https://apps.apple.com/us/app/happitime/id6757933269"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 hover:border-brand hover:shadow-md transition-all mb-6 mx-auto lg:mx-0"
          >
            <svg className="w-7 h-7 text-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.99 2.97 12.5 4.7 9.46C5.55 7.95 7.13 7 8.82 6.97C10.1 6.95 11.32 7.84 12.11 7.84C12.89 7.84 14.37 6.77 15.92 6.93C16.57 6.96 18.39 7.21 19.56 8.91C19.47 8.97 17.09 10.35 17.12 13.18C17.15 16.58 20.01 17.69 20.04 17.7C20.01 17.78 19.58 19.27 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
            </svg>
            <div className="text-left">
              <p className="text-[10px] text-muted leading-none">Download on the</p>
              <p className="text-sm font-semibold text-foreground leading-tight">App Store</p>
            </div>
          </a>

          {/* Android notify signup */}
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
            Get notified when Android launches. No spam.
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
