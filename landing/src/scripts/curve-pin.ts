// A2 — Cinemática de "La Curva": fija la escena (~175vh) y ata el trazo, el punto
// viajero y el encendido de hitos al PROGRESO del pin (no al viewport). Al alcanzar
// cada hito, su caption hace cross-fade. Es el único driver de #la-curva en modo pin
// (la escena lleva [data-curve-pin], así curve-draw.ts/curve-scene.ts la ignoran).
// Degrada a estático en móvil y prefers-reduced-motion.
let pinHandler: (() => void) | null = null;

export function initCurvePin(): void {
  if (pinHandler) {
    window.removeEventListener('scroll', pinHandler);
    window.removeEventListener('resize', pinHandler);
    pinHandler = null;
  }

  const container = document.querySelector<HTMLElement>('.curve-pin');
  if (!container) return;
  const path = container.querySelector<SVGPathElement>('[data-curve-pin]');
  const dot = container.querySelector<SVGCircleElement>('.curve-dot');
  const milestones = Array.from(container.querySelectorAll<HTMLElement>('.milestone[data-at]'));
  const caps = Array.from(container.querySelectorAll<HTMLElement>('.pin-cap > span'));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.matchMedia('(max-width: 639px)').matches;

  const setCaption = (idx: number) => {
    caps.forEach((c, i) => c.classList.toggle('is-active', i === idx));
  };

  // Estado final estático (móvil/reduced-motion/sin pin).
  const settle = () => {
    if (path) path.style.strokeDashoffset = '0';
    if (dot) dot.style.setProperty('offset-distance', '100%');
    milestones.forEach((m) => { m.classList.add('lit'); m.classList.remove('pending'); });
    setCaption(Math.max(0, caps.length - 1));
  };

  if (reduce || small) {
    settle();
    return;
  }

  milestones.forEach((m) => m.classList.add('pending'));

  const apply = (prog: number) => {
    if (path) path.style.strokeDashoffset = String(1 - prog);
    if (dot) dot.style.setProperty('offset-distance', `${(prog * 100).toFixed(2)}%`);
    let active = 0;
    milestones.forEach((m, i) => {
      const at = parseFloat(m.dataset.at ?? '1');
      const lit = prog >= at;
      m.classList.toggle('lit', lit);
      m.classList.toggle('pending', !lit);
      if (lit) active = i;
    });
    setCaption(prog < (parseFloat(milestones[0]?.dataset.at ?? '0')) ? 0 : active);
  };

  const update = () => {
    const rect = container.getBoundingClientRect();
    const span = container.offsetHeight - window.innerHeight;
    const prog = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
    apply(prog);
  };

  let raf = 0;
  pinHandler = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        update();
        raf = 0;
      });
    }
  };
  window.addEventListener('scroll', pinHandler, { passive: true });
  window.addEventListener('resize', pinHandler, { passive: true });
  update();
}
