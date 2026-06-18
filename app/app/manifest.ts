import type { MetadataRoute } from "next";

// Necesario para export estático (Tauri).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CURVA · Tiempos",
    short_name: "CURVA Tiempos",
    description:
      "Mide el tiempo del equipo de CURVA, por tarea, persona y proyecto.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0b14",
    theme_color: "#7c3aed",
    lang: "es",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
