import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Cache Components (PPR-style) requires every dynamic read (searchParams,
  // uncached fetch, etc.) to be wrapped in Suspense or cached via "use
  // cache" — a bigger commitment than this project needs right now.
  // Classic SSR + fetch-level ISR (next: { revalidate }) is what the pages
  // here actually use.
};

export default nextConfig;
