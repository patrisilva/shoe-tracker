import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"`. Next warns that `next start` does not support
  // it, and Railway builds in place and boots with `npm run start`. Standalone
  // only pays off when hand-rolling a minimal Docker image, which would also
  // mean copying .next/static and public/ across by hand.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
