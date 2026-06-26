// Storytelling de la curva: enciende cada hito cuando el trazo lo alcanza.
// Usa la MISMA fórmula de progreso que curve-draw.ts (basada en el top del path),
// así el encendido queda sincronizado con el dibujo del trazo.
// Idempotente y re-armable en astro:page-load (View Transitions).
let sceneHandler: (() => void) | null = null;

export function initCurveScene(): void {
  if (sceneHandler) {
    window.removeEventListener('scroll', sceneHandler);
    sceneHandler = null;
  }

  const milestones = Array.from(
    document.querySelectorAll<HTMLElement>('.milestone[data-at]')
  );
  const path = document.querySelector<SVGPathElement>('#la-curva [data-curve-draw="scroll"]');
  if (!milestones.length || !path) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    milestones.forEach((m) => m.classList.add('lit'));
    return;
  }

  milestones.forEach((m) => m.classList.add('pending'));

  const update = () => {
    const vh = window.innerHeight;
    const start = vh * 1.08;
    const end = vh * 0.52;
    const r = path.getBoundingClientRect();
    let prog = (start - r.top) / (start - end);
    prog = Math.max(0, Math.min(1, prog));
    milestones.forEach((m) => {
      const at = parseFloat(m.dataset.at ?? '1');
      const lit = prog >= at;
      m.classList.toggle('lit', lit);
      m.classList.toggle('pending', !lit);
    });
  };

  let raf = 0;
  sceneHandler = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        update();
        raf = 0;
      });
    }
  };
  window.addEventListener('scroll', sceneHandler, { passive: true });
  update();
}
