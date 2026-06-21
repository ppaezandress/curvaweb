import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "bg-curva-purple text-white hover:opacity-90",
  secondary: "border border-line bg-white text-ink hover:border-curva-purple hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-ink",
  danger: "text-rose-500 hover:bg-rose-50",
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
    neutral: "border border-line bg-white text-ink hover:border-curva-purple",
    primary: "bg-curva-purple text-white hover:opacity-90",
    success: "bg-curva-teal text-white hover:opacity-90",
  };
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full transition focus-ring disabled:opacity-40 active:scale-95",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
