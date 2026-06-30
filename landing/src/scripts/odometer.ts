// A4 — Odómetro: carrete vertical de dígitos para el número héroe.
// Marca [data-odometer="<valor>"] (ej. "500+"). Construye el carrete una sola vez
// y rueda al valor al entrar en viewport. reduced-motion → valor final directo.
let odObserver: IntersectionObserver | null = null;

export function initOdometer(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-odometer]'));
  if (!els.length) return;

  odObserver?.disconnect();
  odObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          roll(e.target as HTMLElement);
          odObserver?.unobserve(e.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  els.forEach((el) => {
    build(el, reduce);
    if (reduce) roll(el, true);
    else odObserver?.observe(el);
  });
}

function build(el: HTMLElement, reduce: boolean): void {
  if (el.dataset.odoReady) return;
  const raw = el.dataset.odometer ?? el.textContent ?? '';
  el.dataset.odoReady = '1';
  el.textContent = '';
  el.classList.add('od');
  [...raw].forEach((ch) => {
    if (/\d/.test(ch)) {
      const col = document.createElement('span');
      col.className = 'od-col';
      const reel = document.createElement('span');
      reel.className = 'od-reel';
      reel.dataset.digit = ch;
      if (reduce) reel.style.transition = 'none';
      for (let d = 0; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = String(d);
        reel.appendChild(s);
      }
      col.appendChild(reel);
      el.appendChild(col);
    } else {
      const sep = document.createElement('span');
      sep.className = 'od-sep';
      sep.textContent = ch;
      el.appendChild(sep);
    }
  });
}

function roll(el: HTMLElement, immediate = false): void {
  const reels = Array.from(el.querySelectorAll<HTMLElement>('.od-reel'));
  reels.forEach((reel, i) => {
    const digit = parseInt(reel.dataset.digit ?? '0', 10);
    const apply = () => { reel.style.transform = `translateY(-${digit}em)`; };
    if (immediate) apply();
    else setTimeout(apply, i * 130);
  });
}
