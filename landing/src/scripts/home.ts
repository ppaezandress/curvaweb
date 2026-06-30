// Interacciones específicas de la home: auto-scroll de los showcases (galería de
// /servicios/marketing). Guardado por presencia (no hace nada en otras páginas).
// Timers con cleanup para no fugarlos entre navegaciones.
let showcaseTimers: number[] = [];

export function initHome(): void {
  showcaseTimers.forEach((t) => clearInterval(t));
  showcaseTimers = [];
  initShowcases();
}

function initShowcases(): void {
  document.querySelectorAll<HTMLElement>('[data-showcase]').forEach((el) => {
    let paused = false;
    el.addEventListener('mouseenter', () => (paused = true));
    el.addEventListener('mouseleave', () => (paused = false));
    el.addEventListener('touchstart', () => (paused = true), { passive: true });
    const timer = window.setInterval(() => {
      if (paused) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) el.scrollLeft = 0;
      else el.scrollLeft += 1;
    }, 30);
    showcaseTimers.push(timer);
  });
}
