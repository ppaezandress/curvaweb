import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Con servidor (Route Handlers) para llamar a Notion del lado servidor.
  // El empaquetado de escritorio pasa a apuntar a la app servida (fase posterior).
  images: { unoptimized: true },
  // Spotify exige 127.0.0.1 como redirect; permitir ese origen en dev.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
