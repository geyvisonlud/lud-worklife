import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Read Later imports (bookmark / saved-posts export files) are sent to a server action.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
