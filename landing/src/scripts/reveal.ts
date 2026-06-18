// Scroll reveal — respeta prefers-reduced-motion y se re-arma en cada navegación.
let observer: IntersectionObserver | null = null;

export function initReveal(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll<HTMLElement>('.reveal');

  if (reduce) {
    els.forEach((e) => e.classList.add('is-visible'));
    return;
  }

  // Desconectar el observer de la navegación anterior para no acumular.
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  els.forEach((e) => observer?.observe(e));
}
