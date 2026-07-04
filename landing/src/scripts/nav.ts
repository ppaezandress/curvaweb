// Nav: estado scrolled (transparente sobre hero oscuro → sólido) + "La Curva Viva",
// el menú a pantalla completa. Listeners globales con cleanup para no duplicar en swaps.
let onScroll: (() => void) | null = null;
let onKeydown: ((e: KeyboardEvent) => void) | null = null;

export function initNav(): void {
  if (onScroll) window.removeEventListener('scroll', onScroll);
  if (onKeydown) document.removeEventListener('keydown', onKeydown);
  onScroll = onKeydown = null;

  const nav = document.getElementById('site-nav');
  if (!nav) return;

  // ---- Estado scrolled ----
  const overHero = nav.hasAttribute('data-over-hero');
  onScroll = () => nav.classList.toggle('scrolled', !overHero || window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---- La Curva Viva (overlay a pantalla completa) ----
  const overlay = document.getElementById('curva-menu');
  const toggle = nav.querySelector<HTMLElement>('[data-cmenu-toggle]');
  if (!overlay || !toggle) return;

  const items = Array.from(overlay.querySelectorAll<HTMLElement>('[data-cmenu-item]'));
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isDesktop = () => window.matchMedia('(min-width: 861px)').matches;

  const setActive = (item: HTMLElement | null, exclusive = true) => {
    items.forEach((it) => {
      const on = it === item;
      // En desktop el escenario es único (exclusivo); en móvil es acordeón (toggle).
      if (exclusive) {
        it.classList.toggle('active', on);
        it.querySelector('[data-cmenu-panel]')?.classList.toggle('active', on);
        it.querySelector('[data-cmenu-trigger]')?.setAttribute('aria-expanded', String(on));
      }
    });
  };

  const openMenu = () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // Escenario por defecto en desktop: el primer destino.
    if (isDesktop()) setActive(items[0]);
    else setActive(null);
    window.setTimeout(() => overlay.querySelector<HTMLElement>('[data-cmenu-trigger]')?.focus(), 60);
  };

  const closeMenu = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    toggle.focus();
  };

  toggle.addEventListener('click', () => {
    overlay.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay.querySelector('[data-cmenu-close]')?.addEventListener('click', closeMenu);
  // Cualquier link dentro del menú cierra el overlay (misma página o navegación).
  overlay.querySelectorAll<HTMLElement>('[data-cmenu-link]').forEach((a) => a.addEventListener('click', closeMenu));

  items.forEach((item) => {
    const trigger = item.querySelector<HTMLElement>('[data-cmenu-trigger]');
    // Desktop: hover/focus cambia el escenario (exclusivo).
    if (canHover) {
      item.addEventListener('mouseenter', () => { if (isDesktop()) setActive(item); });
    }
    trigger?.addEventListener('focus', () => { if (isDesktop()) setActive(item); });
    // Click en el destino:
    trigger?.addEventListener('click', () => {
      const kind = item.dataset.kind;
      if (isDesktop()) {
        // En desktop el escenario ya se muestra al hover; los destinos "directos"
        // (Nosotros / Conversemos) navegan con su propio botón dentro del panel.
        setActive(item);
        return;
      }
      // Móvil: acordeón — toggle de este item.
      const willOpen = !item.classList.contains('active');
      items.forEach((it) => {
        it.classList.remove('active');
        it.querySelector('[data-cmenu-panel]')?.classList.remove('active');
        it.querySelector('[data-cmenu-trigger]')?.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('active');
        item.querySelector('[data-cmenu-panel]')?.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
        void kind;
      }
    });
  });

  // Teclado global: Esc cierra; flechas mueven el escenario en desktop.
  onKeydown = (e: KeyboardEvent) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (!isDesktop()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const active = items.findIndex((it) => it.classList.contains('active'));
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = (active + dir + items.length) % items.length;
      setActive(items[next]);
      items[next].querySelector<HTMLElement>('[data-cmenu-trigger]')?.focus();
    }
  };
  document.addEventListener('keydown', onKeydown);
}
