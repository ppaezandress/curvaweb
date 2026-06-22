// Store en memoria para sesiones de IA en curso (MVP).
// En producción/SaaS esto migra a una tabla (Supabase) para sobrevivir reinicios
// y escalar a múltiples instancias. Para validar con el equipo, memoria basta.

export type OpenSession = { email: string; cwd: string; startedAt: number };

type Store = {
  open: Map<string, OpenSession>; // session_id (Claude Code) → turno en curso
  lastSignal: Map<string, number>; // email → ts de la última señal recibida
  loggedDesktop: Set<string>; // sessionId+endedAt de sesiones Desktop ya registradas (dedup)
};

// Singleton a nivel módulo (persiste entre requests en el mismo proceso).
const g = globalThis as unknown as { __curvaTiming?: Store };
export const timing: Store =
  g.__curvaTiming ?? (g.__curvaTiming = { open: new Map(), lastSignal: new Map(), loggedDesktop: new Set() });
// Defensivo: si el singleton venía de una versión previa (HMR), garantiza el campo nuevo.
if (!timing.loggedDesktop) timing.loggedDesktop = new Set();

export function projectFromCwd(cwd?: string): string {
  if (!cwd) return "Claude Code";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Claude Code";
}
