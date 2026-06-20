import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Con servidor (Route Handlers) para llamar a Notion del lado servidor.
  // El empaquetado de escritorio pasa a apuntar a la app servida (fase posterior).
  images: { unoptimized: true },
};

export default nextConfig;
