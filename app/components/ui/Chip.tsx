import { cn } from "@/lib/cn";

/** Pastilla seleccionable (filtros, áreas). */
export function Chip({
  active = false,
  className,
  ...props
}: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-ring active:scale-[0.98]",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-line bg-surface text-muted hover:border-accent hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
