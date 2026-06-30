// Segmented control con píldora deslizante (estilo Framer/Mobbin).
// Markup esperado: [data-tabs] > .seg[role=tablist] > .seg-pill + .seg-btn[role=tab][data-tab],
// y .seg-panels > .tab-panel[data-panel]. Accesible (flechas/Home/End), auto-avance con pausa.
// Idempotente: re-armable en astro:page-load.
let cleanups: Array<() => void> = [];

export function initTabs(): void {
  cleanups.forEach((fn) => fn());
  cleanups = [];

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const groups = document.querySelectorAll<HTMLElement>('[data-tabs]');

  groups.forEach((group) => {
    const seg = group.querySelector<HTMLElement>('.seg');
    const pill = group.querySelector<HTMLElement>('.seg-pill');
    const tabs = Array.from(group.querySelectorAll<HTMLButtonElement>('.seg-btn'));
    const panels = Array.from(group.querySelectorAll<HTMLElement>('.tab-panel'));
    if (!seg || !pill || !tabs.length) return;

    let active = 0;
    let timer = 0;

    const movePill = () => {
      const btn = tabs[active];
      if (!btn) return;
      pill.style.width = `${btn.offsetWidth}px`;
      pill.style.transform = `translateX(${btn.offsetLeft}px)`;
    };

    const activate = (i: number, focus = false) => {
      active = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => {
        const on = k === active;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      panels.forEach((p, k) => p.classList.toggle('is-active', k === active));
      movePill();
    };

    const onClick = (i: number) => () => {
      activate(i);
      restart();
    };
    tabs.forEach((t, i) => t.addEventListener('click', onClick(i)));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); activate(active + 1, true); restart(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); activate(active - 1, true); restart(); }
      else if (e.key === 'Home') { e.preventDefault(); activate(0, true); restart(); }
      else if (e.key === 'End') { e.preventDefault(); activate(tabs.length - 1, true); restart(); }
    };
    seg.addEventListener('keydown', onKey);

    // Auto-avance (no en reduced-motion) con pausa en hover/focus.
    const tick = () => activate(active + 1);
    const start = () => { if (!reduce) timer = window.setInterval(tick, 4500); };
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    const restart = () => { stop(); start(); };
    group.addEventListener('pointerenter', stop);
    group.addEventListener('pointerleave', start);
    group.addEventListener('focusin', stop);
    group.addEventListener('focusout', start);

    const ro = new ResizeObserver(() => movePill());
    ro.observe(seg);
    const onResize = () => movePill();
    window.addEventListener('resize', onResize, { passive: true });

    // Posicionar tras layout/fuentes.
    activate(0);
    requestAnimationFrame(movePill);
    setTimeout(movePill, 250);
    if ((document as any).fonts?.ready) (document as any).fonts.ready.then(movePill);
    start();

    cleanups.push(() => {
      stop();
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      seg.removeEventListener('keydown', onKey);
    });
  });
}
