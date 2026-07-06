// Nav: estado scrolled (transparente sobre hero oscuro → sólido) + dropdown de
// Consultoría (desktop) + panel móvil compacto. Listeners globales con cleanup
// para no duplicar en swaps de View Transitions.
let onScroll: (() => void) | null = null;
let onDocClick: ((e: MouseEvent) => void) | null = null;
let onKeydown: ((e: KeyboardEvent) => void) | null = null;

export function initNav(): void {
  if (onScroll) window.removeEventListener('scroll', onScroll);
  if (onDocClick) document.removeEventListener('click', onDocClick);
  if (onKeydown) document.removeEventListener('keydown', onKeydown);
  onScroll = onDocClick = onKeydown = null;

  const nav = document.getElementById('site-nav');
  if (!nav) return;

  // ---- Estado scrolled ----
  const overHero = nav.hasAttribute('data-over-hero');
  onScroll = () => nav.classList.toggle('scrolled', !overHero || window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---- Dropdown Consultoría (desktop) ----
  const drop = nav.querySelector<HTMLElement>('[data-nav-drop]');
  const dropBtn = nav.querySelector<HTMLButtonElement>('[data-nav-drop-btn]');
  let hoverTimer = 0;

  const openDrop = () => {
    if (!drop) return;
    drop.setAttribute('data-open', '');
    dropBtn?.setAttribute('aria-expanded', 'true');
  };
  const closeDrop = () => {
    if (!drop) return;
    drop.removeAttribute('data-open');
    dropBtn?.setAttribute('aria-expanded', 'false');
  };

  if (drop && dropBtn) {
    if (canHover) {
      drop.addEventListener('mouseenter', () => { window.clearTimeout(hoverTimer); openDrop(); });
      drop.addEventListener('mouseleave', () => { hoverTimer = window.setTimeout(closeDrop, 120); });
    }
    // Click/tap y teclado. En hover, el mouse-leave/Esc cierra → el click solo abre
    // (evita que el click cierre lo que el hover acaba de abrir). En touch, alterna.
    dropBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (canHover) { openDrop(); return; }
      drop.hasAttribute('data-open') ? closeDrop() : openDrop();
    });
    // Al elegir una opción, cierra.
    drop.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeDrop));
  }

  // ---- Panel móvil compacto ----
  const burger = nav.querySelector<HTMLButtonElement>('[data-nav-burger]');
  const mobile = nav.querySelector<HTMLElement>('[data-nav-mobile]');
  const mAcc = nav.querySelector<HTMLButtonElement>('[data-nav-m-acc]');
  const mGroup = nav.querySelector<HTMLElement>('[data-nav-m-group]');

  const openMobile = () => {
    mobile?.setAttribute('data-open', '');
    mobile?.setAttribute('aria-hidden', 'false');
    burger?.setAttribute('aria-expanded', 'true');
    burger?.setAttribute('aria-label', 'Cerrar menú');
  };
  const closeMobile = () => {
    mobile?.removeAttribute('data-open');
    mobile?.setAttribute('aria-hidden', 'true');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Abrir menú');
  };

  if (burger && mobile) {
    burger.addEventListener('click', () =>
      mobile.hasAttribute('data-open') ? closeMobile() : openMobile()
    );
    mobile.querySelectorAll('[data-nav-m-link]').forEach((a) =>
      a.addEventListener('click', closeMobile)
    );
  }
  if (mAcc && mGroup) {
    mAcc.addEventListener('click', () => {
      const open = mGroup.hasAttribute('data-open');
      if (open) { mGroup.removeAttribute('data-open'); mAcc.setAttribute('aria-expanded', 'false'); }
      else { mGroup.setAttribute('data-open', ''); mAcc.setAttribute('aria-expanded', 'true'); }
    });
  }

  // ---- Cierre global: click fuera + Esc ----
  onDocClick = (e: MouseEvent) => {
    const t = e.target as Node;
    if (drop?.hasAttribute('data-open') && !drop.contains(t)) closeDrop();
    if (mobile?.hasAttribute('data-open') && !mobile.contains(t) && !burger?.contains(t)) closeMobile();
  };
  document.addEventListener('click', onDocClick);

  onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (drop?.hasAttribute('data-open')) { closeDrop(); dropBtn?.focus(); }
    if (mobile?.hasAttribute('data-open')) { closeMobile(); burger?.focus(); }
  };
  document.addEventListener('keydown', onKeydown);

  // Cierra el móvil al pasar a desktop.
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 1024px)').matches) closeMobile();
  }, { passive: true });
}
