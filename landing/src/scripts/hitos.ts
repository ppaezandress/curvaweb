// Coloca los hitos de la escena "La Curva" EXACTAMENTE sobre la línea.
// Los círculos y sus chips estaban puestos a ojo (coords aproximadas) y quedaban
// ligeramente fuera del trazo. Aquí calculamos el punto real sobre el path con
// getPointAtLength (a la fracción `data-at` de cada hito) y reposicionamos tanto el
// <circle data-hito> como el chip .milestone. El % del chip se deriva del viewBox
// del SVG (que llena su contenedor manteniendo la proporción).
let cleanup: (() => void) | null = null;

export function initHitos() {
  // Limpia el listener de la navegación anterior (View Transitions re-arma esto).
  cleanup?.();
  cleanup = null;

  const path = document.querySelector<SVGPathElement>('path[data-hito-path]');
  if (!path) return;
  const svg = path.ownerSVGElement;
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;

  const place = () => {
    const total = path.getTotalLength();
    if (!total) return;
    const circles = svg.querySelectorAll<SVGCircleElement>('circle[data-hito]');
    const chips = document.querySelectorAll<HTMLElement>('.milestone');
    chips.forEach((chip, i) => {
      const at = parseFloat(chip.dataset.at || '0');
      const pt = path.getPointAtLength(at * total);
      const c = circles[i];
      if (c) { c.setAttribute('cx', String(pt.x)); c.setAttribute('cy', String(pt.y)); }
      chip.style.left = `${(pt.x / vb.width) * 100}%`;
      chip.style.top = `${(pt.y / vb.height) * 100}%`;
    });
  };

  place();
  requestAnimationFrame(place);
  const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) fonts.ready.then(place);
  const onResize = () => place();
  window.addEventListener('resize', onResize, { passive: true });
  cleanup = () => window.removeEventListener('resize', onResize);
}
