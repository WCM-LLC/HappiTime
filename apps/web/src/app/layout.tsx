import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['800'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'HappiTime',
  description: 'Venue management platform for Happy Hour marketing and foot traffic analytics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      {/* Some browser extensions (e.g., grammar/spellcheck tools) mutate <body> before hydration. */}
      <body suppressHydrationWarning>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
