import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earn2Keep — Coach App",
  description: "The fundraiser where participants actually earn it.",
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
