import { cn } from "@/lib/cn";
import { statusToneClass } from "@/lib/mock-data";

/** Etiqueta de estado de tarea (usa el tono tolerante a Notion). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        statusToneClass(status),
        className,
      )}
    >
      {status || "Sin empezar"}
    </span>
  );
}

/** Etiqueta neutra/genérica (área, tipo, contador…). */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent/10 text-accent",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
