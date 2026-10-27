import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Idea Lab — Research before you build',
  description: 'An evidence-first workspace for researching and improving your next business idea.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
