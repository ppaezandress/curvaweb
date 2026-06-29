"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";

// Envuelve vistas que SOLO los admins pueden ver (métricas de equipo, reportes, pricing).
// Espera a que el rol esté resuelto para no rebotar a un admin mientras carga.
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, adminResolved } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (adminResolved && !isAdmin) router.replace("/momentos");
  }, [adminResolved, isAdmin, router]);

  if (!adminResolved) return <div className="py-24 text-center text-sm text-muted">Cargando…</div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-muted">Esta sección es solo para administradores. Redirigiendo…</div>;
  return <>{children}</>;
}
