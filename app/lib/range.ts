// Rango de fechas unificado — reemplaza el `Range="week|month|all"` triplicado.
import { mondayOf, firstDayOfMonth } from "@/lib/date";

export type Preset = "this-week" | "last-week" | "7d" | "30d" | "90d" | "month" | "all" | "custom";
export type DateRange = { preset: Preset; from: number; to: number };

const DAY = 86_400_000;

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "this-week", label: "Esta semana" },
  { key: "last-week", label: "Semana pasada" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "all", label: "Todo" },
];

const startOfToday = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfToday = (now: Date) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Resuelve un preset (o rango custom) a { from, to } en ms epoch. */
export function resolveRange(preset: Preset, custom?: { from: number; to: number }, at?: number): DateRange {
  const now = new Date(at ?? Date.now());
  const to = endOfToday(now);
  const s0 = startOfToday(now);
  switch (preset) {
    case "this-week":
      return { preset, from: mondayOf(now).getTime(), to };
    case "last-week": {
      const thisMon = mondayOf(now).getTime();
      return { preset, from: thisMon - 7 * DAY, to: thisMon - 1 };
    }
    case "7d":
      return { preset, from: s0 - 6 * DAY, to };
    case "30d":
      return { preset, from: s0 - 29 * DAY, to };
    case "90d":
      return { preset, from: s0 - 89 * DAY, to };
    case "month":
      return { preset, from: firstDayOfMonth(now).getTime(), to };
    case "all":
      return { preset, from: 0, to };
    case "custom":
      return { preset, from: custom?.from ?? s0 - 29 * DAY, to: custom?.to ?? to };
  }
}

/** Rango anterior del mismo tamaño (para deltas). null cuando es "todo". */
export function prevOf(range: DateRange): { from: number; to: number } | null {
  if (range.preset === "all") return null;
  const span = range.to - range.from;
  return { from: range.from - span - 1, to: range.from - 1 };
}

/** Granularidad recomendada según la amplitud del rango. */
export function granularityFor(range: DateRange): "day" | "week" | "month" {
  const span = range.to - range.from;
  if (range.preset === "all" || span > 120 * DAY) return "month";
  if (span > 35 * DAY) return "week";
  return "day";
}

/** ¿Un timestamp cae dentro del rango? */
export function inRange(ms: number, range: DateRange): boolean {
  return ms >= range.from && ms <= range.to;
}
