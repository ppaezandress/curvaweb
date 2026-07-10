"use client";

import { useState, useId } from "react";
import { cn } from "@/lib/cn";

/** Tooltip ligero sin dependencias: hover/focus muestra `content` junto al hijo.
 *  `side="right"` lo saca a la derecha (para rieles de iconos); por defecto arriba. */
export function Tooltip({
  content,
  children,
  className,
  wrapperClassName,
  side = "top",
  multiline = false,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wrapperClassName?: string;
  side?: "top" | "right";
  multiline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pos =
    side === "right"
      ? "left-full top-1/2 ml-2 -translate-y-1/2"
      : "bottom-full left-1/2 mb-1.5 -translate-x-1/2";
  // Por defecto una sola línea (labels de iconos); multiline permite envolver textos largos
  // (explicaciones de métricas) con un ancho máximo.
  const wrap = multiline ? "max-w-[240px] whitespace-normal leading-snug" : "whitespace-nowrap";
  return (
    <span
      className={cn("relative inline-flex", wrapperClassName)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "pointer-events-none absolute z-50 rounded-control bg-ink px-2.5 py-1.5 text-caption font-medium text-white shadow-float",
            wrap,
            pos,
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
