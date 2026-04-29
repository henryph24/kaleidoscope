import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  // R3F & three: don't try to bundle for the edge runtime
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
