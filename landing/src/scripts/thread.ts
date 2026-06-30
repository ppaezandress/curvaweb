// A1 — El hilo continuo: una sola curva-S fija en el borde que se dibuja con el
// progreso GLOBAL de scroll, con el punto viajero en la cabeza del trazo.
// Aditivo y decorativo (pointer-events:none). Respeta prefers-reduced-motion.
let threadHandler: (() => void) | null = null;

export function initThread(): void {
  if (threadHandler) {
    window.removeEventListener('scroll', threadHandler);
    window.removeEventListener('resize', threadHandler);
    threadHandler = null;
  }

  const root = document.querySelector<HTMLElement>('.thread');
  if (!root) return;
  const svg = root.querySelector<SVGSVGElement>('svg');
  const line = root.querySelector<SVGPathElement>('.thread-line');
  const dot = root.querySelector<HTMLElement>('.thread-dot');
  if (!svg || !line) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    line.style.strokeDashoffset = '0';
    return;
  }

  const len = line.getTotalLength(); // viewBox units (path pathLength=1, pero getTotalLength da unidades reales)

  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const prog = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    line.style.strokeDashoffset = String(1 - prog);
    if (dot) {
      const pt = line.getPointAtLength(prog * len);
      const box = svg.getBoundingClientRect();
      const x = (pt.x / 100) * box.width;
      const y = (pt.y / 1000) * box.height;
      dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    root.classList.toggle('is-live', prog > 0.002 && prog < 0.998);
  };

  let raf = 0;
  threadHandler = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        update();
        raf = 0;
      });
    }
  };
  window.addEventListener('scroll', threadHandler, { passive: true });
  window.addEventListener('resize', threadHandler, { passive: true });
  update();
}
