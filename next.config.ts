import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Read Later imports (bookmark / saved-posts export files) are sent to a server action.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // Reader view libraries run on the server as plain Node packages (not bundled).
  serverExternalPackages: ["linkedom", "@mozilla/readability", "turndown"],
};

export default nextConfig;
