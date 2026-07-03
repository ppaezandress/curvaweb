// Fondo del hero: varias curvas que no se dejan de mover y reaccionan al mouse.
// Cada una arranca en distinto punto/altura ("una a distancia, otra en diagonal").
// Barato: 5 curvas, ~6 puntos cada una, suavizadas con Catmull-Rom → Bézier.
// Respeta prefers-reduced-motion (dibuja estático) y se pausa con la pestaña oculta.

const NS = 'http://www.w3.org/2000/svg';
const W = 1200;
const H = 800;
const N = 5;
const SAMPLES = 6; // puntos por curva

interface CurveDef {
  el: SVGPathElement;
  yBase: number;
  amp: number;
  speed: number;
  freq: number;
  phase: number;
  slope: number; // inclinación (diagonal)
}

// Catmull-Rom → path Bézier suave a partir de puntos [x,y].
function smoothPath(pts: number[][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function initHeroCurves() {
  const svg = document.getElementById('hero-curves-svg') as SVGSVGElement | null;
  if (!svg || svg.dataset.init === '1') return;
  svg.dataset.init = '1';

  const strokes = ['#2563eb', '#3b82f6', '#38bdf8', '#60a5fa', '#93c5fd'];
  const curves: CurveDef[] = [];
  for (let i = 0; i < N; i++) {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', strokes[i % strokes.length]);
    el.setAttribute('stroke-width', String(1.4 + i * 0.35));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('opacity', String(0.18 + i * 0.05));
    svg.appendChild(el);
    curves.push({
      el,
      yBase: H * (0.18 + (0.64 * i) / (N - 1)),
      amp: 34 + i * 16,
      speed: 0.00022 * (1 + i * 0.18),
      freq: 0.0045 + i * 0.0009,
      phase: i * 1.3,
      slope: (i - (N - 1) / 2) * 26, // curvas que "bajan" o "suben" en diagonal
    });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Objetivo del mouse (−1..1) y valor suavizado que lo persigue.
  let tmx = 0, tmy = 0, mx = 0, my = 0;
  const onPointer = (e: PointerEvent) => {
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });

  const render = (t: number) => {
    mx += (tmx - mx) * 0.06;
    my += (tmy - my) * 0.06;
    for (const c of curves) {
      const pts: number[][] = [];
      for (let s = 0; s < SAMPLES; s++) {
        const x = (W / (SAMPLES - 1)) * s;
        const wave = Math.sin(t * c.speed + x * c.freq + c.phase);
        const diag = (c.slope * x) / W;
        const y = c.yBase + diag + wave * c.amp + my * 70 + mx * 24 * Math.sin(x * 0.004 + c.phase);
        pts.push([x, y]);
      }
      c.el.setAttribute('d', smoothPath(pts));
    }
  };

  if (reduce) {
    render(0);
    return;
  }

  let raf = 0;
  let running = true;
  const loop = (t: number) => {
    if (!running) return;
    render(t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Pausar cuando la pestaña no está visible O el hero está fuera de viewport
  // (ahorro de batería/CPU mientras el usuario lee más abajo).
  let onScreen = true;
  const shouldRun = () => onScreen && !document.hidden;
  const resume = () => {
    if (!running && shouldRun()) {
      running = true;
      raf = requestAnimationFrame(loop);
    }
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const onVis = () => (shouldRun() ? resume() : pause());
  document.addEventListener('visibilitychange', onVis);

  const io = new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      shouldRun() ? resume() : pause();
    },
    { threshold: 0 }
  );
  io.observe(svg);

  // Limpieza al navegar con View Transitions (el nodo se reemplaza).
  document.addEventListener('astro:before-swap', () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVis);
    io.disconnect();
  }, { once: true });
}
