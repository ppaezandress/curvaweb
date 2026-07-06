import { cn } from "@/lib/cn";

export type Series = { key: string; label?: string; color?: string; values: number[] };

const VW = 300;
const VH = 100;

/** Trazo suave (Catmull-Rom) generalizado a cualquier viewBox. Devuelve línea y área. */
function smoothPath(values: number[], max: number, w: number, h: number, padY = 6) {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const innerH = h - padY * 2;
  const pts = values.map((v, i) => ({
    x: n === 1 ? w / 2 : (i / (n - 1)) * w,
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
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${h} L ${pts[0].x.toFixed(2)} ${h} Z`;
  return { line, area };
}

/** Gráfica de series temporales: área + línea suave, una o varias series, con eje X.
 *  Colores por serie o acento por defecto (nunca arcoíris). */
export function Chart({
  series,
  values,
  labels,
  height = 120,
  showArea = true,
  bare = false,
  label = "Gráfica de actividad en el tiempo",
  className,
}: {
  series?: Series[];
  values?: number[];
  labels?: string[];
  height?: number;
  showArea?: boolean;
  bare?: boolean;
  label?: string;
  className?: string;
}) {
  const data: Series[] = series ?? (values ? [{ key: "v", color: "var(--accent)", values }] : []);
  const max = Math.max(1, ...data.flatMap((s) => s.values));
  const n = data[0]?.values.length ?? 0;

  // Muestra ~5 etiquetas de eje X sin saturar.
  const axis = labels
    ? labels.map((l, i) => ({ l, i })).filter((_, i) => n <= 6 || i % Math.ceil(n / 5) === 0 || i === n - 1)
    : [];

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={label}>
        {/* gridlines sutiles */}
        {!bare && [0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={VW} y1={VH * g} y2={VH * g} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" />
        ))}
        {data.map((s, si) => {
          const color = s.color ?? "var(--accent)";
          const { line, area } = smoothPath(s.values, max, VW, VH);
          return (
            <g key={s.key}>
              {showArea && (
                <path d={area} fill={color} opacity={data.length > 1 ? 0.08 : 0.12} />
              )}
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: 1 - si * 0.12 }}
              />
            </g>
          );
        })}
      </svg>
      {axis.length > 0 && (
        <div className="mt-1.5 flex justify-between text-caption text-muted">
          {axis.map(({ l, i }) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      {data.length > 1 && data.some((s) => s.label) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {data.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-caption text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? "var(--accent)" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
