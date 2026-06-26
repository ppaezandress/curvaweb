"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  // Redirección del lado del cliente (compatible con export estático / Tauri).
  // El guard del layout privado decide si mostrar el dashboard o mandar a /login.
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted">
      Cargando…
    </div>
  );
}
