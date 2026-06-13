import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@browserbasehq/stagehand",
    "pdf-parse",
    "@elastic/elasticsearch",
    "@modelcontextprotocol/sdk",
  ],
};

export default nextConfig;
