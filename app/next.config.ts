import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Con servidor (Route Handlers) para llamar a Notion del lado servidor.
  // El empaquetado de escritorio pasa a apuntar a la app servida (fase posterior).
  images: { unoptimized: true },
  // Spotify exige 127.0.0.1 como redirect; permitir ese origen en dev.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  // Headers de seguridad (portados del patrón de nazca-web). NO incluye CSP estricto aún
  // (se hace en un lote aparte, probado, para no romper realtime/imágenes/cámara).
  // Permissions-Policy: `camera=(self)` (fotos de tarea/selfie) y `microphone=(self)`
  // (audios en el chat). Chromium estricto (p.ej. Atlas) respeta este header al pie de
  // la letra: con `microphone=()` bloqueaba el micrófono SIN pedir permiso. Safari lo
  // ignora, por eso ahí sí funcionaba.
  // Análisis se simplificó: Reportes vive en Equipo; Recap y Rachas viven en Momentos.
  // Redirect server-side (instantáneo, antes del routing) para enlaces/marcadores viejos.
  async redirects() {
    return [
      { source: "/reportes", destination: "/equipo", permanent: false },
      { source: "/recap", destination: "/momentos", permanent: false },
      { source: "/rachas", destination: "/momentos", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
