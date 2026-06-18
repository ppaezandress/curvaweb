// Tilt 3D sutil en hover — solo desktop (pointer:fine), ref-based (sin frameworks).
// WeakSet evita doble-binding; los nodos nuevos tras un swap se re-vinculan solos.
const bound = new WeakSet<HTMLElement>();

export function initTilt(): void {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return;

  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    if (bound.has(el)) return;
    bound.add(el);

    const strength = parseFloat(el.dataset.tilt || '') || 6;
    el.style.transition = 'transform 0.25s var(--ease-curve)';
    el.style.willChange = 'transform';
    let raf = 0;

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.transform = `perspective(800px) rotateX(${(-py * strength).toFixed(2)}deg) rotateY(${(px * strength).toFixed(2)}deg)`;
          raf = 0;
        });
      }
    });

    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}
