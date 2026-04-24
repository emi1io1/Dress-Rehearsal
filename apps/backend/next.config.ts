import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rehearsal/types", "@rehearsal/agents"],
};

export default nextConfig;
