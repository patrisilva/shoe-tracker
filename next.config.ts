import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"`. Railway builds the project in place and boots it
  // with `npm run start`, and Next refuses to serve a standalone build through
  // `next start` — it warns and then answers nothing, which reaches the proxy
  // as a 502. Standalone only pays off when hand-rolling a minimal Docker
  // image, which would also mean copying .next/static and public/ manually.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
