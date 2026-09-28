import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  output: "export",
  // Only immutable Next.js JS/CSS chunks belong on the public CDN. API
  // responses and private incident evidence must stay on their own origins.
  assetPrefix: process.env.NODE_ENV === "production"
    ? process.env.CDN_ASSET_PREFIX || undefined
    : undefined,
  // Keep dev, production, and browser-test chunks separate. A production
  // build must not replace the HTML/chunks served by a running dev server.
  distDir: process.env.EMERGENCY_E2E_DIST_DIR
    || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
});

export default nextConfig;
