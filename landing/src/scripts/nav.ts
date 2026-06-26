// Nav: estado scrolled (transparente sobre hero oscuro → sólido), dropdown de
// servicios y menú móvil. Listeners globales con cleanup para no duplicar en swaps.
let onScroll: (() => void) | null = null;
let onDocClick: ((e: MouseEvent) => void) | null = null;
let onKeydown: ((e: KeyboardEvent) => void) | null = null;

export function initNav(): void {
  // Limpiar listeners globales de la navegación anterior.
  if (onScroll) window.removeEventListener('scroll', onScroll);
  if (onDocClick) document.removeEventListener('click', onDocClick);
  if (onKeydown) document.removeEventListener('keydown', onKeydown);
  onScroll = onDocClick = onKeydown = null;

  const nav = document.getElementById('site-nav');
  if (!nav) return;

  const overHero = nav.hasAttribute('data-over-hero');
  onScroll = () => nav.classList.toggle('scrolled', !overHero || window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Dropdowns (Servicios mega-menú + Productos digitales)
  const dropdowns = Array.from(nav.querySelectorAll<HTMLElement>('[data-dropdown]'));
  const closeMenu = () => {
    dropdowns.forEach((d) => {
      d.querySelector('[data-dropdown-menu]')?.classList.remove('open');
      d.querySelector('[data-dropdown-trigger]')?.setAttribute('aria-expanded', 'false');
    });
  };
  dropdowns.forEach((d) => {
    const t = d.querySelector<HTMLElement>('[data-dropdown-trigger]');
    const m = d.querySelector<HTMLElement>('[data-dropdown-menu]');
    t?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !m?.classList.contains('open');
      closeMenu();
      if (willOpen) {
        m?.classList.add('open');
        t.setAttribute('aria-expanded', 'true');
      }
    });
    m?.addEventListener('click', (e) => e.stopPropagation());
  });

  // Menú móvil
  const burger = nav.querySelector<HTMLElement>('[data-burger]');
  const mobile = document.getElementById('mobile-menu');
  const closeMobile = () => {
    mobile?.classList.remove('open');
    burger?.classList.remove('active');
    burger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };
  burger?.addEventListener('click', () => {
    const open = mobile?.classList.toggle('open') ?? false;
    burger.classList.toggle('active', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  mobile?.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMobile));

  // Cerrar al clicar fuera + Escape
  onDocClick = () => closeMenu();
  document.addEventListener('click', onDocClick);
  onKeydown = (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeMobile();
    }
  };
  document.addEventListener('keydown', onKeydown);
}
