// Cursor glow ambiental — solo desktop (pointer:fine), idempotente para sobrevivir
// a View Transitions sin duplicar listeners.
export function initCursorGlow(): void {
  const el = document.getElementById('cursor-glow');
  if (!el || el.dataset.init) return;

  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) {
    el.remove();
    return;
  }
  el.dataset.init = '1';

  let raf = 0;
  let x = 0;
  let y = 0;

  window.addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.setProperty('--cx', `${x}px`);
          el.style.setProperty('--cy', `${y}px`);
          el.style.opacity = '1';
          raf = 0;
        });
      }
    },
    { passive: true }
  );

  document.addEventListener('mouseleave', () => {
    el.style.opacity = '0';
  });
}
