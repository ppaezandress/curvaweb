// Smooth scroll con Lenis — instancia única persistente. Se desactiva con
// prefers-reduced-motion. Sincroniza scroll tras View Transitions.
import Lenis from 'lenis';

let lenis: Lenis | null = null;

export function initLenis(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || lenis) return;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

  function raf(time: number) {
    lenis?.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

// El router resetea el scroll del DOM; hay que sincronizar el estado interno de Lenis.
export function resetLenis(): void {
  lenis?.scrollTo(0, { immediate: true });
}
