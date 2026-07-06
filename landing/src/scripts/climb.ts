// El isotipo escala la curva (sección #viaje): único driver de la escena. Liga al
// progreso de scroll TANTO el dibujo del trazo (stroke-dashoffset) como el isotipo
// (getPointAtLength) → van perfectamente sincronizados, con el isotipo en la punta.
// La ventana usa el BORDE INFERIOR de la escena: el viaje arranca cuando la base de
// la curva entra al viewport y termina con la escena completa a la vista, así el
// ascenso ocurre siempre frente al usuario.
// También enciende las fases (.fase.lit) al pasar por cada nodo y dispara la
// celebración de la cima (.summit-reached: bandera + anillos).
// Idempotente (View Transitions) y respeta prefers-reduced-motion: sin movimiento,
// el isotipo queda plantado en la cima con todo encendido y la bandera puesta.
let cleanup: (() => void) | null = null;

export function initClimb(): void {
  cleanup?.();
  cleanup = null;

  const scene = document.querySelector<HTMLElement>('[data-climb]');
  if (!scene) return;
  const stage = scene.querySelector<HTMLElement>('[data-climb-stage]');
  const path = scene.querySelector<SVGPathElement>('path[data-climb-path]');
  const climber = scene.querySelector<HTMLElement>('[data-climber]');
  if (!stage || !path || !climber) return;
  const svg = path.ownerSVGElement;
  const vb = svg?.viewBox.baseVal;
  if (!svg || !vb || !vb.width || !vb.height) return;

  const fases = Array.from(scene.querySelectorAll<HTMLElement>('.fase[data-at]'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let total = 0;
  let w = 0;
  let h = 0;
  const measure = () => {
    total = path.getTotalLength();
    // offsetWidth/Height = tamaño de layout SIN transforms: el wrapper .reveal-scale
    // arranca en scale(0.93) y un getBoundingClientRect ahí daría un mapa 7% corto.
    w = stage.offsetWidth;
    h = stage.offsetHeight;
  };

  const apply = (prog: number) => {
    if (!total || !w) return; // escena oculta (móvil) o aún sin layout
    path.style.strokeDashoffset = String(1 - prog);
    const pt = path.getPointAtLength(prog * total);
    const x = (pt.x / vb.width) * w;
    const y = (pt.y / vb.height) * h;
    climber.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -74%)`;
    climber.classList.add('is-on');
    fases.forEach((f) => {
      f.classList.toggle('lit', prog >= parseFloat(f.dataset.at || '1') - 0.02);
    });
    scene.classList.toggle('summit-reached', prog >= 0.975);
  };

  if (reduce) {
    // Estático: curva dibujada completa, isotipo en la cima, fases encendidas y
    // bandera plantada. Solo re-medimos en resize.
    const settle = () => {
      measure();
      apply(1);
    };
    settle();
    window.addEventListener('resize', settle, { passive: true });
    cleanup = () => window.removeEventListener('resize', settle);
    return;
  }

  // Con JS armado, las fases aún no alcanzadas se atenúan (sin JS quedan visibles).
  scene.classList.add('is-armed');

  const update = () => {
    const vh = window.innerHeight;
    const r = stage.getBoundingClientRect();
    // Ventana sobre el borde INFERIOR de la escena: prog 0 cuando la base de la
    // curva asoma por abajo; prog 1 con la escena completa y cómoda en pantalla.
    const start = vh * 1.02;
    const end = Math.max(vh * 0.55, r.height + vh * 0.12);
    const prog = Math.max(0, Math.min(1, (start - r.bottom) / Math.max(1, start - end)));
    apply(prog);
  };

  let raf = 0;
  const onScroll = () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        update();
        raf = 0;
      });
    }
  };
  const onResize = () => {
    measure();
    update();
  };

  measure();
  update();
  const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) fonts.ready.then(onResize);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  cleanup = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  };
}
