import { ArrowUp, ArrowDown } from "lucide-react";

// KPI con flecha de delta vs periodo anterior.
export function KpiDelta({
  icon,
  label,
  value,
  curr,
  prev,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  curr: number;
  prev: number | null;
  hint?: string;
}) {
  let delta: { up: boolean; text: string } | null = null;
  if (prev !== null && prev > 0) {
    const p = Math.round(((curr - prev) / prev) * 100);
    if (p !== 0) delta = { up: p > 0, text: `${Math.abs(p)}%` };
  } else if (prev === 0 && curr > 0) {
    delta = { up: true, text: "nuevo" };
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">{icon}{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="tabular font-display text-2xl font-bold text-fg">{value}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta.up ? "text-emerald-600" : "text-muted"}`}>
            {delta.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {delta.text}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
