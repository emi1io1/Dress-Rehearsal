import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rehearsal/types"],
};

export default nextConfig;
