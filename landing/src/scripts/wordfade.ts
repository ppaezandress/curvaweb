// Frase que se "enciende" palabra por palabra ligada al scroll (estilo Pitch
// "Presentations are more than an asset…"). Marca [data-wordfade].
// Idempotente y re-armable en astro:page-load (View Transitions).
let wfHandler: (() => void) | null = null;

interface WfEl extends HTMLElement { _wfSpans?: HTMLElement[]; }

export function initWordFade(): void {
  if (wfHandler) {
    window.removeEventListener('scroll', wfHandler);
    wfHandler = null;
  }

  const els = Array.from(document.querySelectorAll<WfEl>('[data-wordfade]'));
  if (!els.length) return;

  // Envolver cada palabra en un span (una sola vez).
  els.forEach((el) => {
    if (el.dataset.wfReady) return;
    const words = (el.textContent ?? '').trim().split(/\s+/);
    el.textContent = '';
    el._wfSpans = words.map((w) => {
      const s = document.createElement('span');
      s.textContent = w + ' ';
      s.style.transition = 'opacity .35s var(--ease-pitch), filter .35s var(--ease-pitch)';
      el.appendChild(s);
      return s;
    });
    el.dataset.wfReady = '1';
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    els.forEach((el) => el._wfSpans?.forEach((s) => { s.style.opacity = '1'; s.style.filter = 'none'; }));
    return;
  }

  const update = () => {
    const vh = window.innerHeight;
    els.forEach((el) => {
      const spans = el._wfSpans;
      if (!spans) return;
      const r = el.getBoundingClientRect();
      let prog = (vh * 0.82 - r.top) / (vh * 0.82 - vh * 0.42);
      prog = Math.max(0, Math.min(1, prog));
      const lit = prog * spans.length;
      spans.forEach((s, i) => {
        const on = i < lit;
        s.style.opacity = on ? '1' : '0.2';
        s.style.filter = on ? 'none' : 'blur(3px)';
      });
    });
  };

  let raf = 0;
  wfHandler = () => {
    if (!raf) raf = requestAnimationFrame(() => { update(); raf = 0; });
  };
  window.addEventListener('scroll', wfHandler, { passive: true });
  update();
}
