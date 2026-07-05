import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const toneText: Record<Tone, string> = {
  neutral: "text-fg",
  accent: "text-accent",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

/** Tile-puerta: la unidad del overview. Muestra un dato sintetizado y LLEVA a la
 *  pantalla de detalle. "Cada tile es una puerta, no un destino." */
export function Tile({
  href,
  label,
  value,
  unit,
  tone = "neutral",
  icon,
  hero = false,
  footer,
  className,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  hero?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring group flex flex-col rounded-card border border-line bg-surface p-5 shadow-soft transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-float",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-caption uppercase text-muted">
          {icon}
          {label}
        </span>
        <ChevronRight
          size={16}
          className="text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-accent"
        />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tabular font-display font-semibold leading-none",
            hero ? "text-display" : "text-title",
            toneText[tone],
          )}
        >
          {value}
        </span>
        {unit && <span className="text-body text-muted">{unit}</span>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </Link>
  );
}
