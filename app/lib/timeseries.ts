// bucketize() — base de TODAS las series de tiempo. Une TimeRecord → tarea →
// área/proyecto/cliente, bucketiza por día/semana/mes y RELLENA periodos vacíos.
// Función pura: recibe los mapas de useData() (sin hooks).
import type { TimeRecord } from "@/lib/notion/fetchers";
import type { Task, TaskType, Client, Project } from "@/lib/mock-data";
import { mondayOf, firstDayOfMonth, monthShort } from "@/lib/date";

export type Granularity = "day" | "week" | "month";
export type GroupBy = "none" | "area" | "project" | "client";
export type BucketSeries = { key: string; label: string; color?: string; total: number; values: number[] };
export type Bucketized = { buckets: string[]; series: BucketSeries[] };

export type EntityMaps = {
  taskById: Record<string, Task>;
  taskTypeById: Record<string, TaskType>;
  projectById: Record<string, Project>;
  clientById: Record<string, Client>;
};

// Paleta de series: violeta (acento) + azul + neutros. Disciplinada, nunca arcoíris.
export const SERIES_COLORS = ["#6c47f5", "#5b8bf5", "#9a7bf9", "#45434f", "#b4b4c1", "#c9b8fb"];

const bucketStart = (ms: number, g: Granularity): number => {
  if (g === "day") {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (g === "week") return mondayOf(new Date(ms)).getTime();
  return firstDayOfMonth(new Date(ms)).getTime();
};

const nextBucket = (ms: number, g: Granularity): number => {
  const d = new Date(ms);
  if (g === "day") d.setDate(d.getDate() + 1);
  else if (g === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
};

const bucketLabel = (ms: number, g: Granularity): string => {
  const d = new Date(ms);
  if (g === "day") return String(d.getDate());
  if (g === "week") return `${d.getDate()} ${monthShort(d)}`;
  return monthShort(d);
};

function groupOf(r: TimeRecord, maps: EntityMaps, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === "none") return { key: "total", label: "Tiempo" };
  const t = maps.taskById[r.taskId];
  if (groupBy === "area") {
    const ty = t ? maps.taskTypeById[t.typeId] : undefined;
    return { key: ty?.id ?? "otro", label: ty?.label ?? "Otro" };
  }
  if (groupBy === "project") {
    const p = t ? maps.projectById[t.projectId] : undefined;
    return { key: p?.id ?? "otro", label: p?.name ?? "Sin proyecto" };
  }
  // client — vía task.clientId directo, o resolviendo por proyecto.
  const cid = t?.clientId || (t ? maps.projectById[t.projectId]?.clientId : undefined);
  const c = cid ? maps.clientById[cid] : undefined;
  return { key: c?.id ?? "otro", label: c?.name ?? "Sin cliente" };
}

/**
 * @param records  registros ya filtrados (persona/equipo) — se filtran por [from,to] aquí.
 * @param opts.maxSeries  top-N grupos; el resto se agrupa en "Otro" (default 5).
 * @returns valores en MINUTOS por bucket, series ordenadas por total desc con color asignado.
 */
export function bucketize(
  records: TimeRecord[],
  opts: {
    from: number;
    to: number;
    granularity: Granularity;
    groupBy?: GroupBy;
    maps: EntityMaps;
    maxSeries?: number;
  },
): Bucketized {
  const { from, to, granularity, groupBy = "none", maps, maxSeries = 5 } = opts;

  const withMs = records
    .map((r) => ({ r, ms: new Date(r.start).getTime() }))
    .filter((x) => !isNaN(x.ms) && x.ms >= from && x.ms <= to && (x.r.minutes || 0) > 0);

  // "Todo" (from=0) → arranca en el primer registro para no generar miles de buckets.
  const effFrom = from === 0 ? (withMs.length ? Math.min(...withMs.map((x) => x.ms)) : to) : from;

  // Buckets ordenados + índice por ms de inicio.
  const bucketsMs: number[] = [];
  const idxByMs = new Map<number, number>();
  for (let m = bucketStart(effFrom, granularity); m <= to; m = nextBucket(m, granularity)) {
    idxByMs.set(m, bucketsMs.length);
    bucketsMs.push(m);
  }
  const nB = bucketsMs.length;
  const buckets = bucketsMs.map((m) => bucketLabel(m, granularity));

  // Acumula minutos por grupo × bucket.
  const byGroup = new Map<string, { label: string; values: number[]; total: number }>();
  for (const x of withMs) {
    const bi = idxByMs.get(bucketStart(x.ms, granularity));
    if (bi === undefined) continue;
    const g = groupOf(x.r, maps, groupBy);
    let s = byGroup.get(g.key);
    if (!s) {
      s = { label: g.label, values: new Array(nB).fill(0), total: 0 };
      byGroup.set(g.key, s);
    }
    s.values[bi] += x.r.minutes || 0;
    s.total += x.r.minutes || 0;
  }

  let series: BucketSeries[] = [...byGroup.entries()]
    .map(([key, s]) => ({ key, label: s.label, values: s.values, total: s.total }))
    .sort((a, b) => b.total - a.total);

  // Colapsa la cola en "Otro" cuando hay muchos grupos.
  if (groupBy !== "none" && series.length > maxSeries) {
    const head = series.slice(0, maxSeries);
    const tail = series.slice(maxSeries);
    const otro: BucketSeries = {
      key: "otro",
      label: "Otro",
      total: tail.reduce((a, s) => a + s.total, 0),
      values: new Array(nB).fill(0).map((_, i) => tail.reduce((a, s) => a + s.values[i], 0)),
    };
    series = [...head, otro];
  }

  series.forEach((s, i) => {
    s.color = groupBy === "none" ? "var(--accent)" : SERIES_COLORS[i % SERIES_COLORS.length];
  });

  return { buckets, series };
}
