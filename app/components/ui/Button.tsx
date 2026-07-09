import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition focus-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90 glow-accent",
  secondary: "border border-line bg-surface text-fg hover:border-accent hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "text-danger hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: { variant?: Variant; size?: Size } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

/** Botón cuadrado de solo ícono (play/pause/check…). */
export function IconButton({
  className,
  tone = "neutral",
  ...props
}: { tone?: "neutral" | "primary" | "success" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones = {
    neutral: "border border-line bg-surface text-fg hover:border-accent",
    primary: "bg-accent text-white hover:opacity-90 glow-accent",
    success: "bg-success text-white hover:opacity-90",
  };
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-control transition focus-ring disabled:opacity-40 active:scale-95",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
