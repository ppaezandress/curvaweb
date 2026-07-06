import { formatHours } from "@/lib/format";
import { money } from "@/lib/rates";
import { TypeIcon } from "@/components/TypeIcon";

// Barras horizontales reutilizables (Reportes / Equipo). Cada item: horas + costo
// opcional + promedio por entregable (showAvg). `icon` pinta el TypeIcon del tipo.
export function Bars({
  items,
  showCost,
  icon,
  gradient,
  showAvg,
}: {
  items: { key: string; label: string; minutes: number; cost: number; count?: number; color?: string }[];
  showCost: boolean;
  icon?: boolean;
  gradient?: boolean;
  showAvg?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.minutes), 1);
  return (
    <div className="space-y-4">
      {items.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-fg">
              {icon && (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-white" style={{ background: r.color }}>
                  <TypeIcon typeId={r.key} size={12} />
                </span>
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 text-muted">
              <span className="tabular font-semibold text-fg">{formatHours(r.minutes * 60)}</span>
              {showCost && <span className="tabular ml-2 text-success">{money(r.cost)}</span>}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${gradient ? "curva-gradient" : ""}`} style={{ width: `${(r.minutes / max) * 100}%`, background: gradient ? undefined : r.color || "var(--color-accent)" }} />
          </div>
          {showAvg && (r.count ?? 0) > 0 && (
            <p className="mt-1 text-caption text-muted">
              ~<span className="font-semibold text-fg">{formatHours((r.minutes / r.count!) * 60)}</span> por entregable
              {showCost && <> · <span className="text-success">{money(r.cost / r.count!)}</span></>}
              <span className="ml-1">({r.count} {r.count === 1 ? "tarea" : "tareas"})</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
