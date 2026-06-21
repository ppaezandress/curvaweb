// Helpers de formato de tiempo.

/** "1h 23m" — para tiempos acumulados (legible). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "01:23:45" — para el cronómetro en vivo. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** "12.5 h" — para reportes y agregados. */
export function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return `${hours.toFixed(1).replace(".0", "")} h`;
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** "14:05" desde milisegundos epoch. */
export function hhmmFromMs(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "14:05" desde una fecha ISO (timestamp de Supabase). */
export function hhmmFromISO(iso: string): string {
  return hhmmFromMs(new Date(iso).getTime());
}

/** Iniciales para avatar: "Andrés Páez" → "AP". */
export function initials(name: string): string {
  const p = (name || "?").trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}
