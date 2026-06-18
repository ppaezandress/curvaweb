import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export estático para empaquetar dentro de la app de escritorio (Tauri).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
