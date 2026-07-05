import { cn } from "@/lib/cn";

type Band = "low" | "mid" | "high";

export function scoreBand(value: number): Band {
  if (value >= 75) return "high";
  if (value >= 50) return "mid";
  return "low";
}

const bandStroke: Record<Band, string> = {
  low: "var(--warn)",
  mid: "var(--accent)",
  high: "var(--success)",
};

/** Anillo de progreso con el score al centro. Fill SÓLIDO por banda semántica
 *  (bajo = alerta, medio = acento, alto = éxito). Sin gradiente arcoíris. */
export function ScoreRing({
  value,
  size = 160,
  stroke = 12,
  label,
  sublabel,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const band = scoreBand(v);
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bandStroke[band]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-display text-[2.75rem] font-semibold leading-none text-fg">{Math.round(v)}</span>
        {label && <span className="mt-1 text-caption uppercase text-muted">{label}</span>}
        {sublabel && <span className="mt-0.5 text-caption text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
