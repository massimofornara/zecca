import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/**": ["./prisma/dev.db", "./prisma/schema.prisma"],
  },
};

export default nextConfig;
