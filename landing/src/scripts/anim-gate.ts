// Pausa las animaciones CSS infinitas de secciones pesadas cuando NO están en
// viewport (diagrama de nodos, escena "La Curva"). Marca las secciones con
// [data-anim-gate]; cuando salen de pantalla se les pone `.is-offscreen` y el CSS
// pausa sus animaciones (`animation-play-state: paused`). Ahorra CPU/batería en
// móvil sin cambiar nada visual. Idempotente: re-armable en astro:page-load.
let io: IntersectionObserver | null = null;

export function initAnimGate(): void {
  io?.disconnect();
  io = null;

  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-anim-gate]'));
  if (!els.length) return;

  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting));
    },
    // Reanuda un poco antes de entrar para que nunca se vea "congelado".
    { rootMargin: '250px 0px' },
  );

  els.forEach((el) => {
    el.classList.add('is-offscreen'); // arranca pausado; el IO lo corrige al observar
    io!.observe(el);
  });
}
