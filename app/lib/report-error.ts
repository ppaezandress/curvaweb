"use client";

// Reporte de errores desde el navegador hacia la bitácora del servidor (/api/client-error).
// Regla de oro: reportar NUNCA puede romper ni ralentizar lo que el usuario está haciendo —
// si el reporte falla, se traga en silencio (es telemetría, no funcionalidad).
//
// Anti-ruido: mismo scope+mensaje solo se manda una vez cada 5 minutos por pestaña. Sin esto,
// un reintento en bucle (p. ej. el sync del cronómetro con la red caída) llenaría la tabla.
const RECENT_MS = 5 * 60 * 1000;
const recent = new Map<string, number>();

export function reportClientError(
  scope: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Error ? error.message || error.name : typeof error === "string" ? error : String(error);

  const key = `${scope}:${message}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < RECENT_MS) return;
  recent.set(key, now);

  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, message: message.slice(0, 500), meta }),
      keepalive: true, // sobrevive si la persona cierra la pestaña justo después
    }).catch(() => {});
  } catch {
    /* telemetría: jamás propaga */
  }
}
