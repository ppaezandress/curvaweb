import { cn } from "@/lib/cn";

/** Tarjeta base del producto: blanca, borde fino, redondeo 2xl, sombra suave. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white p-5 shadow-soft", className)} {...props} />
  );
}
