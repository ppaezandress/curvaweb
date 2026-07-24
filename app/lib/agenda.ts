// Lógica pura de la agenda ("Mi semana"): agrupa las juntas por día, detecta la que está en
// curso y la siguiente, y calcula huecos libres y resumen por día. Va aquí (con pruebas en
// tests/unit/agenda.test.ts) porque es cálculo de fechas/tiempos — el lugar donde más caro
// sale un bug (ver AGENTS.md regla #8; las pruebas corren en America/Mexico_City a propósito).

export type AgendaEvent = {
  id: string;
  title: string;
  start: number; // ms epoch
  end: number; // ms epoch
  attendees: string[]; // correos
  hangoutLink?: string;
};

export type AgendaMeeting = AgendaEvent & {
  gapBeforeMin: number; // minutos libres desde el fin de la junta anterior (mismo día); 0 si no aplica
};

export type AgendaDay = {
  key: string;
  label: string; // "Hoy" · "Mañana" · "mié 23 jul"
  isToday: boolean;
  meetings: AgendaMeeting[];
  count: number;
  busyMin: number; // minutos totales en juntas ese día
};

export type AgendaView = {
  live: AgendaEvent | null; // junta ocurriendo ahora
  next: AgendaEvent | null; // próxima junta (que aún no empieza)
  days: AgendaDay[];
  total: number; // total de juntas relevantes en la ventana
};

const DAY = 86_400_000;
const GRACE = 15 * 60_000; // 15 min de gracia tras el fin: sigue siendo "relevante"

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Etiqueta humana del día, relativa a "ahora".
export function dayLabel(ms: number, now: number): string {
  const k = dayKey(ms);
  if (k === dayKey(now)) return "Hoy";
  if (k === dayKey(now + DAY)) return "Mañana";
  const s = new Date(ms).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  return s.charAt(0).toUpperCase() + s.slice(1); // "Dom 26 jul"
}

const durMin = (e: AgendaEvent) => Math.max(0, Math.round((e.end - e.start) / 60_000));

// Construye la vista completa a partir de los eventos crudos y el "ahora".
export function buildAgenda(events: AgendaEvent[], now: number): AgendaView {
  // Relevantes: las que no terminaron hace más de 15 min. Ordenadas por inicio.
  const relevant = (events ?? [])
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > now - GRACE)
    .sort((a, b) => a.start - b.start);

  // En curso: empezó y no ha terminado. Si hay varias solapadas, la que termina primero.
  const liveCandidates = relevant.filter((e) => e.start <= now && e.end > now);
  const live = liveCandidates.length ? liveCandidates.reduce((a, b) => (a.end <= b.end ? a : b)) : null;

  // Próxima: la primera que aún no empieza.
  const next = relevant.find((e) => e.start > now) ?? null;

  // Agrupar por día conservando el orden.
  const days: AgendaDay[] = [];
  for (const e of relevant) {
    const k = dayKey(e.start);
    let day = days.find((d) => d.key === k);
    if (!day) {
      day = { key: k, label: dayLabel(e.start, now), isToday: k === dayKey(now), meetings: [], count: 0, busyMin: 0 };
      days.push(day);
    }
    const prev = day.meetings[day.meetings.length - 1];
    const gapBeforeMin = prev ? Math.max(0, Math.round((e.start - prev.end) / 60_000)) : 0;
    day.meetings.push({ ...e, gapBeforeMin });
  }
  for (const d of days) {
    d.count = d.meetings.length;
    d.busyMin = d.meetings.reduce((a, m) => a + durMin(m), 0);
  }

  return { live, next, days, total: relevant.length };
}

// "en 25 min" / "en 2 h 10 min" / "ahora". Para la cuenta regresiva de la próxima junta.
export function untilLabel(target: number, now: number): string {
  const ms = target - now;
  if (ms <= 0) return "ahora";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "en menos de 1 min";
  if (totalMin < 60) return `en ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `en ${h} h ${m} min` : `en ${h} h`;
}

// Progreso 0..1 de una junta en curso (para la barra viva).
export function progressOf(e: AgendaEvent, now: number): number {
  const span = e.end - e.start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (now - e.start) / span));
}

// "45 min" / "1 h 30 min" para duración de junta o hueco libre.
export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ── Vista de calendario (rejilla de mes) ────────────────────────────────────

export type MonthCell = { ms: number; day: number; inMonth: boolean; isToday: boolean; count: number; meetings: AgendaEvent[] };
export type MonthGrid = { label: string; weekdays: string[]; weeks: MonthCell[][] };

// Medianoche local del día que contiene `ms`.
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Desplazamiento (0..6) del inicio de semana. weekStartsOn=1 → lunes.
function weekdayOffset(ms: number, weekStartsOn: number): number {
  return (new Date(ms).getDay() - weekStartsOn + 7) % 7;
}

// Rango [from, to] que cubre la rejilla de 6 semanas del mes que contiene `anchorMs`.
// La página pide exactamente esto a /api/gcal/range.
export function monthGridRange(anchorMs: number, weekStartsOn = 1): { from: number; to: number } {
  const a = new Date(anchorMs);
  const firstOfMonth = startOfDay(new Date(a.getFullYear(), a.getMonth(), 1).getTime());
  const from = firstOfMonth - weekdayOffset(firstOfMonth, weekStartsOn) * DAY;
  return { from, to: from + 42 * DAY };
}

// Suma o resta meses a un ancla (para navegar ‹ ›), fijando el día 1 para no desbordar.
export function shiftMonth(anchorMs: number, delta: number): number {
  const a = new Date(anchorMs);
  return new Date(a.getFullYear(), a.getMonth() + delta, 1).getTime();
}

// Juntas de un día concreto, ordenadas por hora.
export function meetingsOn(events: AgendaEvent[], dayMs: number): AgendaEvent[] {
  const s = startOfDay(dayMs);
  const e = s + DAY;
  return (events ?? []).filter((ev) => ev.start >= s && ev.start < e).sort((a, b) => a.start - b.start);
}

// Construye la rejilla de 6×7 del mes que contiene `anchorMs`, con el conteo de juntas por día.
export function buildMonthGrid(events: AgendaEvent[], anchorMs: number, now: number, weekStartsOn = 1): MonthGrid {
  const a = new Date(anchorMs);
  const month = a.getMonth();
  const { from } = monthGridRange(anchorMs, weekStartsOn);
  const todayS = startOfDay(now);

  // Juntas por día (clave = medianoche local), ordenadas por hora.
  const byDay = new Map<number, AgendaEvent[]>();
  for (const ev of [...(events ?? [])].sort((a, b) => a.start - b.start)) {
    const k = startOfDay(ev.start);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(ev);
  }

  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = from + (w * 7 + d) * DAY;
      const date = new Date(ms);
      const meetings = byDay.get(startOfDay(ms)) ?? [];
      row.push({
        ms, day: date.getDate(), inMonth: date.getMonth() === month,
        isToday: startOfDay(ms) === todayS, count: meetings.length, meetings,
      });
    }
    weeks.push(row);
  }

  const mes = new Date(anchorMs).toLocaleDateString("es-MX", { month: "long" });
  const label = `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${a.getFullYear()}`; // "Julio 2026"
  const weekdays = weekStartsOn === 1 ? ["L", "M", "M", "J", "V", "S", "D"] : ["D", "L", "M", "M", "J", "V", "S"];
  return { label, weekdays, weeks };
}
