"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/anim/CountUp";

type Band = "low" | "mid" | "high";

export function scoreBand(value: number): Band {
  if (value >= 75) return "high";
  if (value >= 50) return "mid";
  return "low";
}

const bandVar: Record<Band, string> = {
  low: "var(--warn)",
  mid: "var(--accent)",
  high: "var(--success)",
};

/** Anillo de progreso con el score al centro. Trazo de UNA sola familia por banda
 *  semántica (bajo = alerta, medio = acento, alto = éxito), con degradado sutil
 *  claro→tono y número que cuenta al entrar. Sin arcoíris. */
export function ScoreRing({
  value,
  size = 160,
  stroke = 11,
  label,
  sublabel,
  onDark = false,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const band = scoreBand(v);
  const gid = useId().replace(/:/g, "");
  const col = bandVar[band];
  const track = onDark ? "rgba(255,255,255,0.22)" : "var(--surface-2)";
  const numCls = onDark ? "text-white" : "text-fg";
  const labelCls = onDark ? "text-white/75" : "text-muted";
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`ring-${gid}`} x1="0" y1="0" x2="1" y2="1">
            {onDark ? (
              <>
                <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
                <stop offset="1" stopColor="#ffffff" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor={`color-mix(in srgb, ${col} 55%, white)`} />
                <stop offset="1" stopColor={col} />
              </>
            )}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.9s var(--ease-curva)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={Math.round(v)} className={cn("tabular font-display text-[2.75rem] font-semibold leading-none", numCls)} />
        {label && <span className={cn("mt-1 text-caption font-medium", labelCls)}>{label}</span>}
        {sublabel && <span className={cn("mt-0.5 text-caption", labelCls)}>{sublabel}</span>}
      </div>
    </div>
  );
}
