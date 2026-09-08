import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.LIFE_ATLAS_TARGET === "volcengine" ? {
    output: "standalone" as const,
    // Their WASM loaders need Node's CommonJS module paths at runtime.
    serverExternalPackages: ["sql.js", "@volcengine/tos-sdk"],
  } : {}),
};

export default nextConfig;
