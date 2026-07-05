"use client";

import { useDateRange } from "@/lib/range-context";
import { PRESETS } from "@/lib/range";
import { cn } from "@/lib/cn";

const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromInput = (v: string, endOfDay = false) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Selector de rango: presets + rango personalizado. Persiste en la URL. */
export function RangePicker({ className }: { className?: string }) {
  const { range, setPreset, setCustom } = useDateRange();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={cn(
              "focus-ring rounded-[7px] px-2.5 py-1 text-caption font-medium transition",
              range.preset === p.key ? "bg-ink text-white" : "text-muted hover:text-fg",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={toInput(range.from)}
          max={toInput(range.to)}
          onChange={(e) => {
            const f = fromInput(e.target.value);
            if (f !== null) setCustom(f, range.to);
          }}
          aria-label="Desde"
          className="focus-ring rounded-control border border-line bg-surface px-2 py-1 text-caption text-fg [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="text-caption text-muted">→</span>
        <input
          type="date"
          value={toInput(range.to)}
          min={toInput(range.from)}
          onChange={(e) => {
            const t = fromInput(e.target.value, true);
            if (t !== null) setCustom(range.from, t);
          }}
          aria-label="Hasta"
          className="focus-ring rounded-control border border-line bg-surface px-2 py-1 text-caption text-fg [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
    </div>
  );
}
