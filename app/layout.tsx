import type { Metadata } from "next";
import "./globals.css";

// Slice 5.1.2 — browser tab title was "earn²keep — Coach App", which doesn't
// reflect that the app now serves players (via /join/[token] and the upcoming
// player home in 5.3) and sponsors (public /sponsor/[token] pages). Cleaned
// up to lead with the brand + tagline so it reads right for any visitor.
//
// Individual routes can override this via their own `metadata` export when
// page-specific titles add value (e.g. /join/[token] could set
// "earn²keep — You're invited!" later).
export const metadata: Metadata = {
  title: "earn²keep — Earn it. Keep it.",
  description:
    "The fundraiser where players actually earn it. Verified challenges, sponsor-funded entries, and real prizes for the winners.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
