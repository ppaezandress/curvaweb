import { cn } from "@/lib/cn";

/** Tarjeta base del producto: blanca, borde fino, redondeo de card, sombra suave.
 *  El padding lo fija la card (no cada pantalla). `interactive` la vuelve clicable
 *  con elevación al hover — base de los tiles-puerta. */
export function Card({
  interactive = false,
  className,
  ...props
}: { interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-soft",
        interactive &&
          "cursor-pointer transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-float",
        className,
      )}
      {...props}
    />
  );
}
