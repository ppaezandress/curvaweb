import { cn } from "@/lib/cn";

/** Barra de progreso accesible (role=progressbar). Reemplaza las barras
 *  reimplementadas a mano. Color de barra por defecto = acento. */
export function Meter({
  value,
  max = 100,
  label,
  className,
  barClassName,
  height = "h-2",
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
  barClassName?: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-surface-2", height, className)}
    >
      <div
        className={cn("h-full rounded-full bg-accent transition-[width] duration-500 ease-curva", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
