import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputBase } from "./Input";

/** Select nativo estilizado (mismo look que Input, con chevron propio). */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, "cursor-pointer appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
