import type { Metadata } from "next";
import DemoBanner from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Time With Me",
  description:
    "Choose a time for an interview, coffee chat, in-person event or ski lesson.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
