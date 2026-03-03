import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/lib/ThemeProvider';

export const metadata: Metadata = {
  title: 'Schedule a Meeting',
  description: 'Book time on my calendar — interviews, coffee chats, and in-person events.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
