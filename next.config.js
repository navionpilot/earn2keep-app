/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // Sponsor → Supporter rename (L11).
      // Pre-existing QR codes and PDF flyers in the wild link to /sponsor/[token]
      // — this 308 permanent redirect keeps those working forever.
      {
        source: "/sponsor/:token",
        destination: "/supporter/:token",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
