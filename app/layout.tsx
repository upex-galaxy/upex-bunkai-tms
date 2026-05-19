import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Noto_Serif_JP } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const notoSerifJP = Noto_Serif_JP({
  weight: ['600', '700'],
  subsets: ['latin'],
  variable: '--font-noto-serif-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bunkai — Test Management System',
  description:
    'Open-core Test Management System. ATCs (Atomic Test Components), modular tests, full traceability — built for engineering teams that take QA seriously.',
  metadataBase: new URL('http://localhost:3000'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${notoSerifJP.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-surface-0 text-fg-1 antialiased">
        {children}
      </body>
    </html>
  );
}
