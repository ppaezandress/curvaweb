import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), payment=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
