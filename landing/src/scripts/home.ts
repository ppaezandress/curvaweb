// Interacciones específicas de la home: carrusel de casos + auto-scroll de los
// showcases. Guardado por presencia (no hace nada en otras páginas). Timers con
// cleanup para no fugarlos entre navegaciones.
let showcaseTimers: number[] = [];

export function initHome(): void {
  showcaseTimers.forEach((t) => clearInterval(t));
  showcaseTimers = [];
  initCases();
  initShowcases();
}

function initCases(): void {
  const track = document.getElementById('cases-track');
  if (!track) return;
  const prev = document.getElementById('prev-case');
  const next = document.getElementById('next-case');
  const dots = Array.from(document.querySelectorAll<HTMLElement>('.case-dot'));
  const cards = Array.from(track.querySelectorAll<HTMLElement>('.case-card'));
  if (!cards.length) return;

  let current = 0;
  const scrollTo = (i: number) => {
    const idx = Math.max(0, Math.min(cards.length - 1, i));
    const left =
      cards[idx].getBoundingClientRect().left -
      track.getBoundingClientRect().left +
      track.scrollLeft;
    track.scrollTo({ left, behavior: 'smooth' });
  };

  prev?.addEventListener('click', () => scrollTo(current - 1));
  next?.addEventListener('click', () => scrollTo(current + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => scrollTo(i)));

  let raf = 0;
  track.addEventListener(
    'scroll',
    () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        cards.forEach((c, i) => {
          const center = c.offsetLeft + c.clientWidth / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        current = best;
        dots.forEach((d, i) => d.classList.toggle('dot-active', i === best));
        raf = 0;
      });
    },
    { passive: true }
  );
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
