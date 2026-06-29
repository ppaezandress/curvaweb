// Helpers puros de analítica, compartidos por Insights / Reportes / Equipo.

export type Range = "week" | "month" | "all";

// Inicio del rango actual (00:00 del lunes / día 1 del mes / epoch para "todo").
export function rangeStart(range: Range): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.getTime();
  }
  if (range === "month") {
    d.setDate(1);
    return d.getTime();
  }
  return 0;
}

// Rango anterior del mismo tamaño (para el delta). null cuando es "todo".
export function prevRange(range: Range): { start: number; end: number } | null {
  if (range === "all") return null;
  const end = rangeStart(range);
  if (range === "week") return { start: end - 7 * 86_400_000, end };
  const d = new Date(end);
  d.setMonth(d.getMonth() - 1);
  return { start: d.getTime(), end };
}

// Franjas del día (alineadas con el Recap).
export const SLOTS = [
  { key: "madrugada", label: "Madrugada", emoji: "🌙", from: 0, to: 5 },
  { key: "amanecer", label: "Amanecer", emoji: "🌅", from: 5, to: 8 },
  { key: "mañana", label: "Mañana", emoji: "☀️", from: 8, to: 12 },
  { key: "tarde", label: "Tarde", emoji: "🌤️", from: 12, to: 18 },
  { key: "atardecer", label: "Atardecer", emoji: "🌆", from: 18, to: 21 },
  { key: "noche", label: "Noche", emoji: "🦉", from: 21, to: 24 },
];
export function slotOf(hour: number) {
  return SLOTS.find((s) => hour >= s.from && hour < s.to) ?? SLOTS[SLOTS.length - 1];
}

// "La curva": convierte una serie en un trazo SUAVE (área + línea), no en barras.
// Coordenadas en un viewBox 100×40; el stroke se mantiene crisp con non-scaling-stroke.
export function smoothCurve(vals: number[], max: number) {
  const W = 100, H = 40, padY = 4;
  const n = vals.length;
  if (n === 0) return { line: "", area: "" };
  const innerH = H - padY * 2;
  const pts = vals.map((v, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: padY + innerH - (max > 0 ? (v / max) * innerH : 0),
  }));
  const d = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  const line = d.join(" ");
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${H} L ${pts[0].x.toFixed(2)} ${H} Z`;
  return { line, area };
}
