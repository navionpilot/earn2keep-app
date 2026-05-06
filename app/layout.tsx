import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "earn²keep — Coach App",
  description: "Earn it. Keep it.",
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
