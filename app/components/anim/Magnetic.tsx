"use client";

import { useEffect, useRef } from "react";

// Envuelve un botón/CTA para que se "atraiga" al cursor dentro de su área
// (portado de magnetic.ts de la landing). Escribe transform directo al DOM
// vía rAF, sin re-render. Solo en desktop (pointer:fine) y si no hay
// prefers-reduced-motion; en touch renderiza un wrapper plano sin listeners.
export function Magnetic({
  children,
  strength = 0.35,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef<number>(0);
  const enabled = useRef(false);

  useEffect(() => {
    enabled.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (!enabled.current) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { el.style.transform = `translate(${dx}px, ${dy}px)`; });
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.transform = "translate(0px, 0px)";
  };

  return (
    <span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={`inline-block will-change-transform ${className}`}
      style={{ transition: "transform 0.35s var(--ease-pitch)" }}
    >
      {children}
    </span>
  );
}
