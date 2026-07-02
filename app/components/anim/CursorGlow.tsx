"use client";

import { useEffect, useRef } from "react";

// Halo de luz suave que sigue el cursor DENTRO del contenedor padre (para
// superficies oscuras/gradiente). Portado del cursor-glow de la landing/Nazca,
// versión zero-dep (rAF, escribe background directo). El padre debe ser
// position:relative y overflow:hidden. Solo desktop (pointer:fine).
export function CursorGlow({
  color = "rgba(255,255,255,0.16)",
  size = 260,
}: {
  color?: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.background = `radial-gradient(${size}px circle at ${x}px ${y}px, ${color}, transparent 62%)`;
      });
    };
    const onLeave = () => { el.style.opacity = "0"; };

    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [color, size]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none opacity-0 transition-opacity duration-300"
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    />
  );
}
