// Motivo firma: dibuja la curva con stroke-dashoffset.
//  - [data-curve-draw="auto"]   → se traza una vez al cargar.
//  - [data-curve-draw="scroll"] → se traza ligada al progreso de scroll.
// Respeta prefers-reduced-motion y se re-arma limpio en cada navegación.
let scrollHandler: (() => void) | null = null;

export function initCurveDraw(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Limpiar el handler de la navegación anterior.
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  // Trazo automático al cargar.
  document.querySelectorAll<SVGPathElement>('[data-curve-draw="auto"]').forEach((p) => {
    if (reduce) {
      p.style.strokeDashoffset = '0';
      return;
    }
    p.style.transition = 'stroke-dashoffset 1.5s var(--ease-draw)';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        p.style.strokeDashoffset = '0';
      })
    );
  });

  // Trazo ligado al scroll.
  const scrollPaths = Array.from(
    document.querySelectorAll<SVGPathElement>('[data-curve-draw="scroll"]')
  );
  if (!scrollPaths.length) return;

  if (reduce) {
    scrollPaths.forEach((p) => (p.style.strokeDashoffset = '0'));
    return;
  }

  const update = () => {
    const vh = window.innerHeight;
    const start = vh * 0.92;
    const end = vh * 0.35;
    scrollPaths.forEach((p) => {
      const r = p.getBoundingClientRect();
      let prog = (start - r.top) / (start - end);
      prog = Math.max(0, Math.min(1, prog));
      p.style.strokeDashoffset = String(1 - prog);
    });
  };

  let raf = 0;
  scrollHandler = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        update();
        raf = 0;
      });
    }
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });
  update();
}
