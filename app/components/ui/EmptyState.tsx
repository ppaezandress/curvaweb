import { cn } from "@/lib/cn";

/** Estado vacío amable y guía (anti-abrumamiento). */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-muted/70">{icon}</div>}
      <p className="font-semibold text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
