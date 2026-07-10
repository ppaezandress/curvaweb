import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { MetricHint } from "@/components/ui/MetricHint";

export type Delta = { up: boolean; text: string; muted?: boolean } | null;

/** Delta a partir de curr/prev (comparación vs periodo anterior). */
export function toDelta(curr: number, prev: number | null): Delta {
  if (prev !== null && prev > 0) {
    const p = Math.round(((curr - prev) / prev) * 100);
    if (p !== 0) return { up: p > 0, text: `${Math.abs(p)}%`, muted: p < 0 };
  } else if (prev === 0 && curr > 0) {
    return { up: true, text: "nuevo" };
  }
  return null;
}

/** Número + etiqueta + delta. Bloque interno reutilizable (sin card propia). */
export function Stat({
  icon,
  label,
  value,
  delta,
  hint,
  help,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  delta?: Delta;
  hint?: React.ReactNode;
  help?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted">
        {icon}
        {label}
        {help && <MetricHint text={help} />}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-title text-fg">{value}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-caption font-semibold",
              delta.muted ? "text-muted" : delta.up ? "text-success" : "text-danger",
            )}
          >
            {delta.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {delta.text}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
    </div>
  );
}
