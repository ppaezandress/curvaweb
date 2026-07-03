// Carrusel accesible para "Impacto real" (y reutilizable).
// - Arrastre con puntero (desactiva snap mientras arrastra; suprime el click).
// - Botones prev/next y dots sincronizados con el scroll.
// - Teclado: ←/→ avanzan por tarjeta cuando el track tiene foco; Home/End a extremos.
// - Idempotente: se re-arma en cada astro:page-load sin duplicar listeners.

function paddingLeft(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).paddingLeft) || 0;
}

function initOne(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-carousel-track]');
  if (!track || track.dataset.carouselReady) return;
  track.dataset.carouselReady = '1';

  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const dotsWrap = root.querySelector<HTMLElement>('[data-carousel-dots]');
  const cards = Array.from(track.children) as HTMLElement[];
  if (!cards.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Dots ---
  const dots: HTMLButtonElement[] = [];
  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    cards.forEach((_, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'caso-dot';
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', `Ir al caso ${i + 1}`);
      d.addEventListener('click', () => scrollToIndex(i));
      dotsWrap.appendChild(d);
      dots.push(d);
    });
  }

  const step = (): number =>
    cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth;

  function activeIndex(): number {
    const target = track!.scrollLeft + paddingLeft(track!);
    let best = 0;
    let min = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - target);
      if (d < min) { min = d; best = i; }
    });
    return best;
  }

  function scrollToIndex(i: number): void {
    const clamped = Math.max(0, Math.min(cards.length - 1, i));
    const left = cards[clamped].offsetLeft - paddingLeft(track!);
    track!.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
  }

  function sync(): void {
    const i = activeIndex();
    dots.forEach((d, di) => {
      const on = di === i;
      d.classList.toggle('is-active', on);
      d.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const atStart = track!.scrollLeft <= 2;
    const atEnd = track!.scrollLeft + track!.clientWidth >= track!.scrollWidth - 2;
    if (prev) prev.disabled = atStart;
    if (next) next.disabled = atEnd;
  }

  prev?.addEventListener('click', () => scrollToIndex(activeIndex() - 1));
  next?.addEventListener('click', () => scrollToIndex(activeIndex() + 1));

  // --- Scroll → sincroniza estado (throttle con rAF) ---
  let raf = 0;
  track.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { sync(); raf = 0; });
  }, { passive: true });

  // --- Teclado sobre el track ---
  track.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollToIndex(activeIndex() + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToIndex(activeIndex() - 1); }
    else if (e.key === 'Home') { e.preventDefault(); scrollToIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); scrollToIndex(cards.length - 1); }
  });

  // --- Arrastre con puntero ---
  let down = false;
  let startX = 0;
  let startScroll = 0;
  let moved = 0;

  track.addEventListener('pointerdown', (e: PointerEvent) => {
    // Solo arrastre primario (mouse izq / touch / pen); ignora si es en un control
    if (e.button && e.button !== 0) return;
    down = true;
    moved = 0;
    startX = e.clientX;
    startScroll = track.scrollLeft;
  });

  track.addEventListener('pointermove', (e: PointerEvent) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4 && !track.classList.contains('is-dragging')) {
      track.classList.add('is-dragging');
      try { track.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (track.classList.contains('is-dragging')) {
      moved = Math.abs(dx);
      track.scrollLeft = startScroll - dx;
    }
  });

  const endDrag = (): void => {
    if (!down) return;
    down = false;
    if (track.classList.contains('is-dragging')) {
      track.classList.remove('is-dragging');
      // Al soltar, deja que el snap acomode a la tarjeta más cercana.
      if (!reduce) scrollToIndex(activeIndex());
    }
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('pointerleave', endDrag);

  // Suprime el click si venía de un arrastre real (evita navegar sin querer).
  track.addEventListener('click', (e) => {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; }
  }, true);

  // Recalcular en resize (cambia el ancho de tarjeta entre breakpoints)
  let rt = 0;
  window.addEventListener('resize', () => {
    if (!rt) rt = window.setTimeout(() => { sync(); rt = 0; }, 150);
  });

  sync();
}

export function initCarousel(): void {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(initOne);
}
