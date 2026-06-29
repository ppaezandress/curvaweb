// Parallax sutil con el cursor (estilo Pitch: capas decorativas que dan profundidad).
// Marca [data-parallax="<px>"] en elementos SIN animación de transform propia.
// Solo en desktop con puntero fino; respeta prefers-reduced-motion.
let pHandler: ((e: MouseEvent) => void) | null = null;

export function initParallax(): void {
  if (pHandler) {
    window.removeEventListener('mousemove', pHandler);
    pHandler = null;
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fine) return;

  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  if (!els.length) return;

  let raf = 0;
  let tx = 0;
  let ty = 0;
  pHandler = (e) => {
    tx = e.clientX / window.innerWidth - 0.5;
    ty = e.clientY / window.innerHeight - 0.5;
    if (!raf) {
      raf = requestAnimationFrame(() => {
        els.forEach((el) => {
          const d = parseFloat(el.dataset.parallax || '18');
          el.style.transform = `translate3d(${(-tx * d).toFixed(1)}px, ${(-ty * d).toFixed(1)}px, 0)`;
        });
        raf = 0;
      });
    }
  };
  window.addEventListener('mousemove', pHandler, { passive: true });
}
