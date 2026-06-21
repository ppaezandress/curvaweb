import { cn } from "@/lib/cn";

/** Tarjeta de métrica: etiqueta arriba, valor grande abajo. */
export function StatCard({
  label,
  value,
  hint,
  accent = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5 shadow-soft", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-bold tabular", accent ? "text-curva-purple" : "text-ink")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
