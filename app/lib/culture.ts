// Métricas de cultura: racha de días midiendo tiempo.

export type DayKey = string; // YYYY-MM-DD

export function dayKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Racha de días consecutivos (terminando hoy o ayer) con al menos un registro.
export function computeStreak(daysWithActivity: Set<DayKey>): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Permite que la racha "siga viva" si ayer hubo pero hoy aún no.
  if (!daysWithActivity.has(dayKey(d.getTime()))) {
    d.setDate(d.getDate() - 1);
    if (!daysWithActivity.has(dayKey(d.getTime()))) return 0;
  }
  while (daysWithActivity.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
