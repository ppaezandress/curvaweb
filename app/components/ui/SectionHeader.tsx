import { cn } from "@/lib/cn";

/** Encabezado consistente de sección/página: título + subtítulo + acción opcional. */
export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-title text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
      </div>
      {action && <div className="sm:shrink-0">{action}</div>}
    </div>
  );
}
