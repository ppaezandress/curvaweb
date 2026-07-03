// Smooth scroll con Lenis — instancia única persistente. Se desactiva con
// prefers-reduced-motion. Modo `lerp` (responsivo, natural, tipo Pitch) en vez
// de duration alto (que se sentía flotante). Las anclas y saltos programáticos
// se rutean por Lenis para que no "peleen" contra la rueda (evita scroll raro).
import Lenis from 'lenis';

let lenis: Lenis | null = null;

export function initLenis(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || lenis) return;

  lenis = new Lenis({
    lerp: 0.1,          // seguimiento cercano a la rueda (sin glide pesado)
    wheelMultiplier: 1,
    smoothWheel: true,
  });
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

  function raf(time: number) {
    lenis?.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Anclas en la MISMA página: mismo motor que la rueda (consistente, con offset del nav).
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const hash = a.getAttribute('href');
    if (!hash || hash === '#') return;
    const target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    lenis?.scrollTo(target as HTMLElement, { offset: -90 });
  });
}

// Salto programático (p. ej. la caja del hero → chat) por Lenis si está activo.
export function scrollToEl(el: Element, offset = -80): void {
  const l = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (l) l.scrollTo(el as HTMLElement, { offset });
  else (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// El router resetea el scroll del DOM; hay que sincronizar el estado interno de Lenis.
export function resetLenis(): void {
  lenis?.scrollTo(0, { immediate: true });
}
