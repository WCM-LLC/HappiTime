import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HappiTime — Kansas City Happy Hour Guide",
    template: "%s | HappiTime",
  },
  description:
    "Find the best happy hours in Kansas City. Browse deals by neighborhood — Westport, Power & Light, Crossroads, Plaza, and more.",
  metadataBase: new URL("https://happitime.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "HappiTime",
    title: "HappiTime — Kansas City Happy Hour Guide",
    description:
      "Find the best happy hours in Kansas City. Browse deals by neighborhood.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HappiTime — Kansas City Happy Hour Guide",
    description:
      "Find the best happy hours in Kansas City. Browse deals by neighborhood.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-50">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            Happi
          </span>
          <span className="text-xl font-extrabold tracking-tight text-brand">
            Time
          </span>
        </a>
        <nav className="flex items-center gap-6 text-sm font-medium text-muted">
          <a href="/kc/" className="hover:text-foreground transition-colors">
            Kansas City
          </a>
          <a
            href="https://trendscouter.vercel.app"
            className="hover:text-foreground transition-colors"
          >
            Venue Login
          </a>
          <a
            href="https://apps.apple.com"
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
        <p>&copy; {new Date().getFullYear()} HappiTime. All rights reserved.</p>
        <div className="flex gap-6">
          <a
            href="https://trendscouter.vercel.app"
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
        </div>
      </div>
    </footer>
  );
}
