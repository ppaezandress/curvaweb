// Auto-play del interruptor pains→gains: lo alterna solo cada X segundos para que
// la gente vea la transformación sin tener que picarle. Se pausa cuando el usuario
// pasa el cursor, lo enfoca, o cuando la sección sale de viewport. La barra de
// progreso (scaleX) muestra cuánto falta para el siguiente cambio. Respeta
// prefers-reduced-motion (sin auto-play). Idempotente: re-armable en astro:page-load.
let cleanup: (() => void) | null = null;

export function initPgAuto(): void {
  cleanup?.();
  cleanup = null;

  const pg = document.querySelector<HTMLElement>('[data-pg]');
  const toggle = document.querySelector<HTMLInputElement>('#pg-toggle');
  if (!pg || !toggle) return;

  const bar = pg.querySelector<HTMLElement>('.pg-progress-bar');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // sin auto-play; el toggle sigue funcionando a mano

  const INTERVAL = 4200; // ms entre cambios automáticos
  let raf = 0;
  let cycleStart = 0;
  let elapsedBeforePause = 0;
  let playing = false;
  let inView = false;
  let hovered = false;
  let focused = false;

  const canPlay = () => inView && !hovered && !focused && !document.hidden;

  const setPausedFlag = () => {
    if (canPlay()) pg.removeAttribute('data-pg-paused');
    else pg.setAttribute('data-pg-paused', '');
  };

  const tick = (now: number) => {
    const elapsed = elapsedBeforePause + (now - cycleStart);
    const p = Math.min(elapsed / INTERVAL, 1);
    if (bar) bar.style.transform = `scaleX(${p})`;
    if (p >= 1) {
      toggle.checked = !toggle.checked;
      elapsedBeforePause = 0;
      cycleStart = now;
    }
    raf = requestAnimationFrame(tick);
  };

  const play = () => {
    if (playing || !canPlay()) return;
    playing = true;
    setPausedFlag();
    cycleStart = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(raf);
    // Congela el progreso acumulado para reanudar donde iba
    elapsedBeforePause = Math.min(elapsedBeforePause + (performance.now() - cycleStart), INTERVAL);
    setPausedFlag();
  };

  // El usuario tomó el control: respeta su elección y reinicia la cuenta.
  const onUserChange = () => {
    elapsedBeforePause = 0;
    cycleStart = performance.now();
    if (bar) bar.style.transform = 'scaleX(0)';
  };

  const onEnter = () => { hovered = true; pause(); };
  const onLeave = () => { hovered = false; play(); };
  const onFocusIn = () => { focused = true; pause(); };
  const onFocusOut = () => { focused = false; play(); };
  const onVisibility = () => { if (document.hidden) pause(); else play(); };

  pg.addEventListener('pointerenter', onEnter);
  pg.addEventListener('pointerleave', onLeave);
  pg.addEventListener('focusin', onFocusIn);
  pg.addEventListener('focusout', onFocusOut);
  toggle.addEventListener('change', onUserChange);
  document.addEventListener('visibilitychange', onVisibility);

  const io = new IntersectionObserver(
    (entries) => {
      inView = entries[0]?.isIntersecting ?? false;
      if (inView) play();
      else pause();
    },
    { threshold: 0.35 },
  );
  io.observe(pg);

  cleanup = () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    pg.removeEventListener('pointerenter', onEnter);
    pg.removeEventListener('pointerleave', onLeave);
    pg.removeEventListener('focusin', onFocusIn);
    pg.removeEventListener('focusout', onFocusOut);
    toggle.removeEventListener('change', onUserChange);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
