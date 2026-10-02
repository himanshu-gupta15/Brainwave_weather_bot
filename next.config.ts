import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SOP/taxonomy YAML is read from disk at request time (so it can be edited
  // live); make sure production output tracing ships it with the API routes.
  outputFileTracingIncludes: {
    "/api/*": ["./data/**/*"],
  },
};

export default nextConfig;
