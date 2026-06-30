// Botones magnéticos (estilo Framer): los [data-magnetic] se atraen sutilmente al cursor
// cuando entra en su radio y regresan al salir. Solo desktop pointer:fine y con motion activo.
// data-magnetic="<fuerza>" opcional (0–1, default 0.3). Idempotente.
let mHandler: ((e: MouseEvent) => void) | null = null;

export function initMagnetic(): void {
  if (mHandler) {
    window.removeEventListener('mousemove', mHandler);
    mHandler = null;
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fine) return;

  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));
  if (!els.length) return;
  els.forEach((el) => { el.style.willChange = 'transform'; });

  let raf = 0;
  let mx = 0;
  let my = 0;

  mHandler = (e) => {
    mx = e.clientX;
    my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const radius = Math.max(r.width, r.height) / 2 + 64;
        const dist = Math.hypot(dx, dy);
        const strength = parseFloat(el.dataset.magnetic || '') || 0.3;
        if (dist < radius) {
          el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
          el.style.transition = 'transform .12s ease-out';
        } else if (el.style.transform) {
          el.style.transform = '';
          el.style.transition = 'transform .4s cubic-bezier(0.22,1,0.36,1)';
        }
      });
    });
  };
  window.addEventListener('mousemove', mHandler, { passive: true });
}
