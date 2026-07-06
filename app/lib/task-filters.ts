// Filtros por rango de fecha de vencimiento — compartidos por /tareas y el
// tablero "Para hoy" del dashboard (feedback #51 y #43). Usa las due dates de
// Notion vía dueDateMs (que ya corrige el corrimiento por zona horaria).
import { dueDateMs, mondayOf, firstDayOfMonth } from "@/lib/date";

const DAY = 86_400_000;

export type DateRange =
  | "todos"
  | "vencidas"
  | "hoy"
  | "manana"
  | "semana"
  | "prox_semana"
  | "mes"
  | "prox_mes"
  | "sin_fecha";

// Orden pensado para chips: de lo más urgente a lo más lejano.
export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "vencidas", label: "Vencidas" },
  { key: "hoy", label: "Hoy" },
  { key: "manana", label: "Mañana" },
  { key: "semana", label: "Esta semana" },
  { key: "prox_semana", label: "Próxima" },
  { key: "mes", label: "Este mes" },
  { key: "prox_mes", label: "Próximo mes" },
  { key: "sin_fecha", label: "Sin fecha" },
];

/** ¿Cae la due date `dueIso` dentro del rango pedido? `now` inyectable para tests. */
export function inDateRange(dueIso: string | undefined | null, range: DateRange, now = Date.now()): boolean {
  if (range === "todos") return true;
  const due = dueDateMs(dueIso);
  if (range === "sin_fecha") return due == null;
  if (due == null) return false;

  const t0 = new Date(now).setHours(0, 0, 0, 0);
  switch (range) {
    case "vencidas":
      return due < t0;
    case "hoy":
      return due >= t0 && due < t0 + DAY;
    case "manana":
      return due >= t0 + DAY && due < t0 + 2 * DAY;
    case "semana": {
      const mon = mondayOf(new Date(now)).getTime();
      return due >= mon && due < mon + 7 * DAY;
    }
    case "prox_semana": {
      const mon = mondayOf(new Date(now)).getTime() + 7 * DAY;
      return due >= mon && due < mon + 7 * DAY;
    }
    case "mes": {
      const f = firstDayOfMonth(new Date(now)).getTime();
      const next = firstDayOfMonth(new Date(f + 32 * DAY)).getTime();
      return due >= f && due < next;
    }
    case "prox_mes": {
      const f = firstDayOfMonth(new Date(now)).getTime();
      const next = firstDayOfMonth(new Date(f + 32 * DAY)).getTime();
      const nextNext = firstDayOfMonth(new Date(next + 32 * DAY)).getTime();
      return due >= next && due < nextNext;
    }
    default:
      return true;
  }
}
