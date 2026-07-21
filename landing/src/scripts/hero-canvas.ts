// "Campo de seda" (tema azul) — hebras BLANCAS que fluyen ALREDEDOR del texto
// (agrupadas arriba y abajo; el centro queda limpio). Al entrar pasan de volátil
// (esfuerzo) a orden que se eleva (estructura). El cursor NO las explota: las
// inclina suavemente hacia él (radio chico, magnitud chica) y una "luz que sigue"
// las enciende donde tocas — sin deformarlas. Canvas 2D, DPR-aware, se pausa
// fuera de viewport / pestaña oculta y respeta prefers-reduced-motion.

const STRANDS = 16;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

export function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null;
  if (!canvas || canvas.dataset.init === '1') return;
  canvas.dataset.init = '1';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedParticles();
  };

  // Cursor: posición objetivo (tx,ty), posición suavizada (cxp,cyp) y una
  // envolvente cStrength (0→1) que entra al mover y se DESVANECE al salir
  // (sin teletransporte → sin "snap-back").
  let tx = -9999, ty = -9999, cxp = -9999, cyp = -9999;
  let cStrength = 0, cActive = false, hasMoved = false;
  let pox = 0, poy = 0; // desplazamiento de parallax global (mouse) suavizado
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top;
    cActive = true; hasMoved = true;
  };
  const onLeave = () => { cActive = false; };

  // Hebras agrupadas arriba (mitad) y abajo (mitad): el centro queda despejado.
  const strands = Array.from({ length: STRANDS }, (_, i) => {
    const half = Math.floor(STRANDS / 2);
    const top = i < half;
    const j = top ? i : i - half;
    const denom = Math.max(1, half - 1);
    const band = top ? 0.05 + (j / denom) * 0.26 : 0.69 + (j / denom) * 0.26;
    return { phase: i * 1.7, band, accent: i === half - 1 || i === STRANDS - 1, depth: j / denom };
  });

  // Partículas de luz a la deriva (sutiles; off en reduced-motion).
  const PCOUNT = reduce ? 0 : 7;
  let particles: { x: number; y: number; sp: number; ph: number; a: number }[] = [];
  function seedParticles() {
    particles = Array.from({ length: PCOUNT }, (_, i) => ({
      x: ((i * 61) % 100) / 100 * W,
      y: ((i * 37) % 100) / 100 * H,
      sp: 0.15 + (i % 3) * 0.08,
      ph: i * 1.3,
      a: 0.10 + (i % 4) * 0.03,
    }));
  }

  const SAMPLES = () => Math.max(24, Math.min(64, Math.round(W / 22)));

  function pointY(s: { phase: number; band: number }, nx: number, t: number, settle: number) {
    const chaos = 1 - settle;
    const rise = -H * 0.14 * easeOut(nx) * settle; // se eleva a la derecha (estructura)
    const amp = H * (0.026 + 0.03 * chaos);
    let y =
      Math.sin(nx * 1.9 * Math.PI + t * 0.30 + s.phase) * amp +
      Math.sin(nx * 4.2 * Math.PI - t * 0.17 + s.phase * 1.6) * amp * 0.42;
    // Onda de entrada suave que se desvanece (movimiento pequeño, sin "scramble").
    y += Math.sin(nx * 9 + t * 1.15 + s.phase * 2) * H * 0.024 * chaos;
    return H * s.band + rise + y;
  }

  // Lente suave del cursor: desplaza la hebra hacia la altura del cursor con
  // magnitud ∝ -dy·gaussiana. Eso es la DERIVADA de una gaussiana → una curva S
  // continua: el desplazamiento es 0 justo en el cursor (sin pico/kink) y crece
  // suave alrededor. Nada de Math.sign (era lo que hacía la esquina en "V").
  // Devuelve también `g` (0..1) para encender la hebra cerca del cursor.
  function pointForces(x: number, y: number): [number, number, number] {
    if (cStrength < 0.001) return [x, y, 0];
    const dx = x - cxp, dy = y - cyp;
    const R = Math.min(W, H) * 0.22;
    const g = Math.exp(-(dx * dx + dy * dy) / (2 * R * R)) * cStrength;
    if (g < 0.002) return [x, y, 0];
    const dyPull = -dy * g * 0.7; // curva S suave, sin esquinas
    return [x, y + dyPull, g];
  }

  function strokePath(pts: [number, number][], style: string | CanvasGradient, width: number) {
    ctx!.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
    }
    ctx!.strokeStyle = style;
    ctx!.lineWidth = width;
    ctx!.stroke();
  }

  // El asentamiento de las líneas se dispara cuando SE LEVANTA la cortinilla
  // (evento 'curva:hero-enter'), no en el page-load → así SÍ se ve el movimiento
  // de entrada. Breve (~1.4s); después el cursor toma el control.
  let start = 0, entered = false;
  const DURATION = 1800; // la cortinilla tarda ~0.8s en levantarse → la parte visible del asentamiento dura ~1s
  const beginEntrance = () => { if (entered) return; entered = true; start = performance.now(); };
  // Sin cortinilla (visita repetida, reduced-motion o navegación interna) → entra ya.
  if (reduce || document.documentElement.getAttribute('data-intro-seen') === '1') beginEntrance();
  window.addEventListener('curva:hero-enter', beginEntrance);
  const enterFallback = window.setTimeout(beginEntrance, 3600); // salvaguarda
  let raf = 0, running = false, onScreen = true;

  function frame(now: number) {
    if (!running) return;
    const t = entered ? (now - start) / 1000 : 0;
    const settle = reduce ? 1 : (entered ? smooth(Math.min(1, (now - start) / DURATION)) : 0);

    // Envolvente + suavizado del cursor.
    const target = cActive ? 1 : 0;
    cStrength += (target - cStrength) * (cActive ? 0.10 : 0.03);
    cxp += (tx - cxp) * 0.14;
    cyp += (ty - cyp) * 0.14;
    // Parallax global: TODO el campo de líneas deriva con el mouse (se siente vivo aun
    // cuando el cursor pasa por el centro despejado). Vuelve al reposo al salir el cursor.
    const pxTarget = (hasMoved && cActive) ? (tx / W - 0.5) : 0;
    const pyTarget = (hasMoved && cActive) ? (ty / H - 0.5) : 0;
    pox += (pxTarget - pox) * 0.09;
    poy += (pyTarget - poy) * 0.09;

    ctx!.clearRect(0, 0, W, H);
    ctx!.lineCap = 'round';
    const n = SAMPLES();

    for (const s of strands) {
      const pts: [number, number][] = [];
      let boost = 0;
      const depthPar = 0.6 + s.depth * 0.9; // las hebras "cercanas" se mueven más → parallax con profundidad
      for (let k = 0; k <= n; k++) {
        const nx = k / n;
        // parallax: sube/baja con mouse-Y y se inclina con mouse-X (sin huecos en los bordes)
        const oy = poy * 24 * depthPar + pox * 14 * (nx - 0.5) * 2 * depthPar;
        const [px, py, infl] = pointForces(nx * W, pointY(s, nx, t, settle) + oy);
        pts.push([px, py]);
        if (infl > boost) boost = infl;
      }
      const env = 0.55 + 0.45 * settle;
      const width = s.accent ? 1.7 : 0.8 + s.depth * 0.9;
      let a = (s.accent ? 0.32 : 0.15 + s.depth * 0.18) * env + boost * 0.42;
      if (a > 0.95) a = 0.95;

      if (s.accent) {
        // Bloom sin shadowBlur: halo ancho tenue + core nítido (doble trazo).
        strokePath(pts, `rgba(125,211,252,${(0.12 + boost * 0.22).toFixed(3)})`, 5.5);
        const grad = ctx!.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, `rgba(125,211,252,${a})`);
        strokePath(pts, grad, width);
      } else {
        strokePath(pts, `rgba(255,255,255,${a})`, width);
      }
    }

    // Luz que sigue al cursor: enciende lo que hay debajo sin deformarlo.
    if (!reduce && cStrength > 0.01) {
      ctx!.save();
      ctx!.globalCompositeOperation = 'lighter';
      const gr = Math.min(W, H) * 0.24;
      const A = 0.14 * cStrength;
      const g = ctx!.createRadialGradient(cxp, cyp, 0, cxp, cyp, gr);
      g.addColorStop(0, `rgba(186,230,253,${A})`);
      g.addColorStop(0.5, `rgba(125,211,252,${A * 0.5})`);
      g.addColorStop(1, 'rgba(125,211,252,0)');
      ctx!.fillStyle = g;
      ctx!.beginPath(); ctx!.arc(cxp, cyp, gr, 0, Math.PI * 2); ctx!.fill();
      ctx!.restore();
    }

    // Partículas de luz (sutiles, con blending aditivo).
    if (PCOUNT) {
      ctx!.save();
      ctx!.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        p.y -= p.sp;
        const x = p.x + Math.sin(t * 0.5 + p.ph) * 12;
        if (p.y < -4) { p.y = H + 4; p.x = ((p.x * 1.7 + 53) % W + W) % W; }
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(186,230,253,${p.a * (0.6 + 0.4 * settle)})`;
        ctx!.arc(x, p.y, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    if (reduce) { running = false; return; }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  if (!reduce) {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);
  }

  const play = () => { if (!running && onScreen && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  if (reduce) { running = true; frame(performance.now()); } else play();

  const onVis = () => (document.hidden ? stop() : play());
  document.addEventListener('visibilitychange', onVis);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? play() : stop(); }, { threshold: 0 });
  io.observe(canvas);

  document.addEventListener('astro:before-swap', () => {
    stop();
    clearTimeout(enterFallback);
    window.removeEventListener('curva:hero-enter', beginEntrance);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVis);
    io.disconnect();
  }, { once: true });
}
