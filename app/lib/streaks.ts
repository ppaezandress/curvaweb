// Rachas (streaks) a partir de los registros de tiempo de Notion.
// Regla: cuenta el día si hubo ≥1 sesión. Modo L–V (sáb/dom NO rompen).
// Escudos: hasta N huecos de 1 día entre semana se "perdonan" (no rompen).

export type DayKey = string; // YYYY-MM-DD

export function dayKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6; // domingo o sábado
}

// Avanza al día hábil anterior (saltando fines de semana).
function prevWorkday(d: Date): Date {
  const x = new Date(d);
  do {
    x.setDate(x.getDate() - 1);
  } while (isWeekend(x));
  return x;
}

export type StreakResult = {
  current: number; // días hábiles consecutivos (con escudos aplicados)
  shieldsUsed: number;
  longest: number; // récord histórico
  activeDays: number; // total de días con actividad
};

/**
 * @param days  Set de días (YYYY-MM-DD) con al menos una sesión.
 * @param shields  escudos disponibles (huecos de 1 día hábil perdonados). Default 2.
 */
export function computeStreak(days: Set<DayKey>, shields = 2): StreakResult {
  const activeDays = days.size;
  if (activeDays === 0) return { current: 0, shieldsUsed: 0, longest: 0, activeDays: 0 };

  // --- Racha actual (terminando hoy o el último día hábil) ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = isWeekend(today) ? prevWorkday(today) : today;

  // Si hoy hábil aún no tiene actividad, la racha puede seguir viva desde ayer hábil.
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor = prevWorkday(cursor);
    if (!days.has(dayKey(cursor.getTime()))) {
      // permitir que un escudo cubra el primer hueco
    }
  }

  let current = 0;
  let usedShields = 0;
  // Recorre hacia atrás por días hábiles.
  // Tope de 400 iteraciones por seguridad.
  for (let i = 0; i < 400; i++) {
    const key = dayKey(cursor.getTime());
    if (days.has(key)) {
      current++;
      cursor = prevWorkday(cursor);
    } else if (usedShields < shields) {
      usedShields++; // perdona el hueco
      cursor = prevWorkday(cursor);
    } else {
      break;
    }
  }

  // --- Racha más larga histórica (recorriendo todos los días hábiles del rango) ---
  const sorted = [...days].sort();
  let longest = 0;
  if (sorted.length) {
    const first = new Date(sorted[0] + "T00:00:00");
    const last = new Date(sorted[sorted.length - 1] + "T00:00:00");
    let run = 0, best = 0, sh = 0;
    const d = new Date(first);
    while (d <= last) {
      if (!isWeekend(d)) {
        if (days.has(dayKey(d.getTime()))) { run++; best = Math.max(best, run); }
        else if (sh < shields) { sh++; }
        else { run = 0; sh = 0; }
      }
      d.setDate(d.getDate() + 1);
    }
    longest = Math.max(best, current);
  }

  return { current, shieldsUsed: usedShields, longest, activeDays };
}

// Medallas por días de racha.
export const STREAK_BADGES = [
  { days: 3, label: "Arranque", emoji: "🌱" },
  { days: 7, label: "Una semana", emoji: "🔥" },
  { days: 14, label: "Constante", emoji: "⚡" },
  { days: 30, label: "Imparable", emoji: "🚀" },
  { days: 50, label: "Leyenda", emoji: "💎" },
  { days: 100, label: "Centurión", emoji: "👑" },
];

export function badgeFor(streak: number) {
  let last = null as (typeof STREAK_BADGES)[number] | null;
  for (const b of STREAK_BADGES) if (streak >= b.days) last = b;
  return last;
}
