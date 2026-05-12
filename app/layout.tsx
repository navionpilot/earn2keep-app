import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// =============================================================================
// app/layout.tsx — Root layout (Slice 5.8: PWA installable)
// =============================================================================
// Adds the PWA-required metadata so the app can be "Add to Home Screen"
// installed on iOS Safari and Android Chrome:
//   - manifest:                   /manifest.json
//   - apple-touch-icon (180x180): /apple-touch-icon.png  (iOS home-screen icon)
//   - icons (192x192, 512x512):   /icon-192.png, /icon-512.png  (Android Chrome)
//   - theme-color:                #041418  (status bar color when launched)
//   - viewport with viewport-fit=cover so installed app respects iOS notches
//
// No service worker in v1 — this is the minimal PWA. The app still
// requires a network connection but installs cleanly to home screens
// and runs full-screen with no browser chrome. Adding a service worker
// for offline caching is a future hardening step.
// =============================================================================

export const metadata: Metadata = {
  title: "earn²keep — Earn it. Keep it.",
  description:
    "Youth fundraising challenges, donations, and team competitions. Earn it. Keep it.",
  applicationName: "earn²keep",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "earn²keep",
    startupImage: [{ url: "/apple-touch-icon.png" }],
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#041418",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover lets installed PWA respect iOS Dynamic Island /
  // notch areas instead of leaving white bands at the top/bottom.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Slice L3 — Vercel Web Analytics. Tracks pageviews + navigation
            on the App Router. Auto-respects route changes, so navigating
            between /dashboard, /events, etc. all get counted correctly. */}
        <Analytics />
      </body>
    </html>
  );
}
