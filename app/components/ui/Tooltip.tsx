"use client";

import { useState, useId } from "react";
import { cn } from "@/lib/cn";

/** Tooltip ligero sin dependencias: hover/focus muestra `content` arriba del hijo. */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
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
            "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2.5 py-1.5 text-caption font-medium text-white shadow-float",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
