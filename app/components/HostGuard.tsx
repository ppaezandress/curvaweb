"use client";

import { useEffect } from "react";

// En desarrollo, las cookies de OAuth (Spotify/Google) se guardan en 127.0.0.1
// (porque ahí apuntan los redirect URIs). Si abres la app por "localhost" no se
// ven esas cookies y todo parece "desconectado". Este guard te lleva a 127.0.0.1.
export function HostGuard() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      window.location.replace(window.location.href.replace("localhost", "127.0.0.1"));
    }
  }, []);
  return null;
}
