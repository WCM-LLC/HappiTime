import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HappiTime — Kansas City Happy Hour Guide",
    template: "%s | HappiTime",
  },
  description:
    "Find the best happy hours in Kansas City. Browse deals by neighborhood — Westport, Power & Light, Crossroads, Plaza, and more. Updated daily.",
  keywords: [
    "happy hour",
    "Kansas City happy hour",
    "KC happy hour",
    "happy hour deals",
    "happy hour specials",
    "Kansas City bars",
    "Kansas City restaurants",
    "Westport happy hour",
    "Power and Light happy hour",
    "Crossroads happy hour",
    "Plaza happy hour",
    "drink specials",
    "food specials",
    "happy hour near me",
    "happy hour guide",
    "bar deals",
  ],
  metadataBase: new URL("https://happitime.biz"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "HappiTime",
    title: "HappiTime — Kansas City Happy Hour Guide",
    description:
      "Find the best happy hours in Kansas City. Browse deals by neighborhood.",
    url: "https://happitime.biz",
  },
  twitter: {
    card: "summary_large_image",
    title: "HappiTime — Kansas City Happy Hour Guide",
    description:
      "Find the best happy hours in Kansas City. Browse deals by neighborhood.",
  },
  verification: {
    google: "pending",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "food & drink",
};

import { ItineraryProvider } from "@/components/ItineraryContext";
import { ItineraryBadge } from "@/components/ItineraryBadge";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@800&display=swap"
          rel="stylesheet"
        />
        {/* Google Tag Manager — replace GTM-XXXXXXX with your container ID */}
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');`,
            }}
          />
        )}
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-8MZMX2GH4E"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-8MZMX2GH4E');`,
          }}
        />
      </head>
      <body className="min-h-screen">
        {/* GTM noscript fallback */}
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <ItineraryProvider>
          {process.env.NEXT_PUBLIC_COMING_SOON === "true" ? (
            <>
              <main>{children}</main>
              <Analytics />
            </>
          ) : (
            <>
              <SiteHeader />
              <main>{children}</main>
              <SiteFooter />
              <Analytics />
            </>
          )}
        </ItineraryProvider>
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-50">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center">
          <HappiTimeLogo className="h-8" />
        </a>
        <nav className="flex items-center gap-4 text-sm font-medium text-muted">
          <a href="/kc/" className="hover:text-foreground transition-colors">
            Kansas City
          </a>
          <a href="/guides/" className="hover:text-foreground transition-colors">
            Guides
          </a>
          <ItineraryBadge />
          <a
            href="https://happitime-console.vercel.app/login"
            className="hover:text-foreground transition-colors"
          >
            Venue Login
          </a>
          <a
            href="/app/"
            className="rounded-full bg-brand px-4 py-2 text-white font-semibold text-xs hover:bg-brand-dark transition-colors"
          >
            Get the App
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface mt-16">
      <div className="mx-auto max-w-5xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <div className="flex items-center gap-3">
          <HappiTimeLogo className="h-5" />
          <span className="text-muted-light">&copy; {new Date().getFullYear()}</span>
        </div>
        <div className="flex gap-6">
          <a
            href="https://happitime-console.vercel.app/login"
            className="hover:text-foreground transition-colors"
          >
            Manage Your Venue
          </a>
          <a href="/privacy/" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="/terms/" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a
            href="https://happitime.biz/contactus"
            className="hover:text-foreground transition-colors"
          >
            Contact Us
          </a>
          <a
            href="https://www.instagram.com/findhappitime/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Instagram
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61570674155925"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Facebook
          </a>
          <a
            href="https://www.tiktok.com/@happitime.biz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            TikTok
          </a>
        </div>
      </div>
    </footer>
  );
}

function HappiTimeLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 439 148"
      className={className}
      aria-label="HappiTime"
      role="img"
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
  );
}
