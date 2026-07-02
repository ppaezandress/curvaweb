"use client";

import { useEffect, useRef, useState } from "react";

// Número que cuenta de 0 al valor al entrar en viewport (easeOutCubic).
// Portado del patrón vanilla de la landing de CURVA / Nazca. Sin dependencias.
// Respeta prefers-reduced-motion (muestra el valor final directo).
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 900,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Si ya animó una vez (o hay reduced-motion), reflejar el nuevo valor directo:
    // así el número NO se queda congelado cuando la data cambia (recarga/tarea cerrada).
    if (reduce || fired.current) { setDisplay(value); return; }

    const run = () => {
      fired.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(value * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setDisplay(value);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting && !fired.current) run(); }),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const shown = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString("es-MX");
  return <span ref={ref} className={className}>{prefix}{shown}{suffix}</span>;
}
