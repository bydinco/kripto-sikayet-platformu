import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components (PPR-style) requires every dynamic read (searchParams,
  // uncached fetch, etc.) to be wrapped in Suspense or cached via "use
  // cache" — a bigger commitment than this project needs right now.
  // Classic SSR + fetch-level ISR (next: { revalidate }) is what the pages
  // here actually use.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(
          process.env.NODE_ENV,
          API_ORIGIN,
          process.env.SECURE_HEADERS_HTTPS === "true",
        ),
      },
    ];
  },
};

export default nextConfig;
