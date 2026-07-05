// Control de la cortinilla del logo: gating por sesión + disparo de la timeline
// CSS (.intro-play) + cierre (.intro-out) que revela el hero.
const KEY = 'curva:intro-seen';

export function initIntro() {
  const overlay = document.getElementById('intro');
  if (!overlay || overlay.dataset.done === '1') return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch {}

  if (seen || reduce) {
    document.documentElement.setAttribute('data-intro-seen', '1');
    overlay.remove();
    return;
  }

  overlay.dataset.done = '1';
  try { sessionStorage.setItem(KEY, '1'); } catch {}

  // Dispara la timeline CSS.
  requestAnimationFrame(() => overlay.classList.add('intro-play'));

  // Cierra en cuanto el wordmark ya se leyó (se recorta el settle final de ~350ms
  // para bajar el LCP en primera visita, sin cortar el dibujo ni el wordmark).
  const OUT_AT = 2650;   // el punto traza el isotipo y se postra → "curva" → abre
  const REMOVE_AT = 3450; // + transición de cierre (0.78s)
  window.setTimeout(() => {
    overlay.classList.add('intro-out');
    // Avisa al hero que ya se ve → dispara el asentamiento de las líneas.
    window.dispatchEvent(new CustomEvent('curva:hero-enter'));
  }, OUT_AT);
  window.setTimeout(() => {
    document.documentElement.setAttribute('data-intro-seen', '1');
    overlay.remove();
  }, REMOVE_AT);
}
