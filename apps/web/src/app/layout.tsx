import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HappyHour Client Portal',
  description: 'Client platform to manage venues, menus, happy hours, and media.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Some browser extensions (e.g., grammar/spellcheck tools) mutate <body> before hydration. */}
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
