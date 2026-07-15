// Mini-diagnóstico inmersivo "La nube de tu operación" — idea de Diana (audio 2026-07-10).
// Overlay que se abre con clip-path desde el punto tocado. Atmósfera VIVA: parallax con el
// mouse, aura que sigue el cursor, partículas + relámpago al seleccionar, medidor de tormenta.
// Al revelar: colapso al centro + flash + amanece el arquetipo. Idempotente (astro:page-load).
import { track } from '@vercel/analytics';
import { calcular, arquetipos, categorias, type CatId } from '../data/diagnostico';

export function initDiagnostico(): void {
  const root = document.getElementById('diagnostico');
  if (!root || (root as HTMLElement).dataset.bound) return;
  (root as HTMLElement).dataset.bound = 'true';

  const calLink = root.getAttribute('data-cal') || 'https://cal.com/andres-paez/30min';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const overlay = q<HTMLElement>('[data-dx-overlay]');
  const openBtn = q<HTMLButtonElement>('[data-dx-open]');
  const closeBtn = q<HTMLButtonElement>('[data-dx-close]');
  const clouds = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dx-cloud]'));
  const field = q<HTMLElement>('[data-dx-field]');
  const submit = q<HTMLButtonElement>('[data-dx-submit]');
  const count = q<HTMLElement>('[data-dx-count]');
  const charge = q<HTMLElement>('[data-dx-charge]');
  const chargeFill = q<HTMLElement>('[data-dx-charge-fill]');
  const tint = q<HTMLElement>('[data-dx-tint]');
  const lightning = q<HTMLElement>('[data-dx-lightning]');
  const cursor = q<HTMLElement>('[data-dx-cursor]');
  const flash = q<HTMLElement>('[data-dx-flash]');
  const panelPick = q<HTMLElement>('[data-dx-panel="pick"]');
  const panelResult = q<HTMLElement>('[data-dx-panel="result"]');

  const seleccion = new Set<string>();
  let prevFocus: HTMLElement | null = null;

  // ---------------- parallax + aura del cursor (rAF con lerp) ----------------
  let raf = 0;
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let cx = mx, cy = my;
  const onPointerMove = (e: PointerEvent) => {
    mx = e.clientX; my = e.clientY;
    if (!overlay) return;
    overlay.style.setProperty('--px', String((mx / window.innerWidth - 0.5) * 2));
    overlay.style.setProperty('--py', String((my / window.innerHeight - 0.5) * 2));
  };
  const loop = () => {
    cx += (mx - cx) * 0.16; cy += (my - cy) * 0.16;
    if (cursor) cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    raf = requestAnimationFrame(loop);
  };
  const startAmbient = () => {
    if (reduce || !fine) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  const stopAmbient = () => {
    window.removeEventListener('pointermove', onPointerMove);
    cancelAnimationFrame(raf);
  };

  // ---------------- abrir / cerrar ----------------
  const open = (originEl: HTMLElement) => {
    if (!overlay) return;
    const r = originEl.getBoundingClientRect();
    overlay.style.setProperty('--dx-x', `${((r.left + r.width / 2) / window.innerWidth) * 100}%`);
    overlay.style.setProperty('--dx-y', `${((r.top + r.height / 2) / window.innerHeight) * 100}%`);
    prevFocus = document.activeElement as HTMLElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    void overlay.offsetWidth;
    overlay.classList.add('is-open');
    startAmbient();
    setTimeout(() => closeBtn?.focus(), 60);
    try { track('diagnostico_abrir'); } catch { /* dev */ }
  };
  const close = () => {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    stopAmbient();
    const done = () => { overlay.hidden = true; resetToPick(); prevFocus?.focus(); };
    if (reduce) done(); else setTimeout(done, 620);
  };
  openBtn?.addEventListener('click', () => open(openBtn));
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay && !overlay.hidden) close(); });

  // ---------------- recompensas de selección ----------------
  const strike = () => {
    if (reduce || !lightning) return;
    lightning.classList.remove('go'); void lightning.offsetWidth; lightning.classList.add('go');
  };
  // ---------------- selección + medidor de tormenta ----------------
  const syncDock = () => {
    const n = seleccion.size;
    if (submit) submit.disabled = n === 0;
    if (count) count.innerHTML = n === 0 ? 'Aún nada' : `<b>${n}</b> ${n === 1 ? 'seleccionada' : 'seleccionadas'}`;
    const p = Math.min(n / 16, 1);
    if (chargeFill) chargeFill.style.width = `${p * 100}%`;
    if (charge) charge.setAttribute('data-level', n >= 6 ? 'alta' : 'media');
    if (tint) tint.style.opacity = String(Math.min(n / 8, 1) * 0.95);
  };

  clouds.forEach((cloud) => {
    cloud.addEventListener('click', () => {
      const id = cloud.dataset.id!;
      const on = cloud.getAttribute('aria-pressed') === 'true';
      if (on) {
        seleccion.delete(id);
        cloud.setAttribute('aria-pressed', 'false');
      } else {
        // Feedback de selección = solo CSS (pop + glow + check): compositor-friendly, 60fps.
        // Se quitó el burst de partículas y el strike() por click (DOM churn + reflow = jank).
        seleccion.add(id);
        cloud.setAttribute('aria-pressed', 'true');
      }
      syncDock();
    });
  });

  // ---------------- revelar (colapso + flash + amanecer) ----------------
  const reveal = () => {
    if (seleccion.size === 0 || !field || !panelPick || !panelResult) return;
    const r = calcular([...seleccion]);
    const a = arquetipos[r.arquetipo];

    const dominante = (Object.keys(r.porCat) as CatId[]).sort((x, y) => r.porCat[y] - r.porCat[x])[0];
    const catColor = categorias[dominante]?.color || 'var(--color-ember)';
    panelResult.style.setProperty('--cat', catColor);

    if (!reduce) {
      const fc = field.getBoundingClientRect();
      const cxc = fc.left + fc.width / 2, cyc = fc.top + fc.height / 2;
      clouds.forEach((cloud) => {
        const b = cloud.getBoundingClientRect();
        const on = cloud.getAttribute('aria-pressed') === 'true';
        cloud.dataset.collapse = on ? 'in' : 'out';
        if (on) cloud.style.setProperty('--to-center', `translate(${cxc - (b.left + b.width / 2)}px, ${cyc - (b.top + b.height / 2)}px)`);
      });
      field.classList.add('collapsing');
      flash?.classList.add('go');
      strike();  // relámpago SOLO en el momento del revelar (una vez), no en cada click
    }

    const showResult = () => {
      panelPick.hidden = true;
      panelResult.hidden = false;
      const set = (sel: string, val: string) => { const el = q<HTMLElement>(sel); if (el) el.textContent = val; };
      set('[data-dx-arquetipo]', a.nombre);
      set('[data-dx-lectura]', a.lectura);
      set('[data-dx-necesitas]', a.necesitas);
      set('[data-dx-total]', String(r.total));
      set('[data-dx-eje]', r.eje === 'estrategico' ? 'estratégico' : 'operativo');
      set('[data-dx-caso-label]', a.caso.label);
      const caso = q<HTMLAnchorElement>('[data-dx-caso]'); if (caso) caso.href = a.caso.href;
      const cal = q<HTMLAnchorElement>('[data-dx-cal]'); if (cal) cal.href = calLink;
      q<HTMLElement>('[data-dx-urg]')?.setAttribute('data-level', r.urgencia);
      void panelResult.offsetWidth;
      panelResult.classList.add('lit');
      const urgFill = q<HTMLElement>('[data-dx-urg-fill]');
      requestAnimationFrame(() => { if (urgFill) urgFill.style.width = `${Math.min(r.total / 8, 1) * 100}%`; });
    };
    if (reduce) showResult(); else setTimeout(showResult, 560);

    try { track('diagnostico_resultado', { arquetipo: r.arquetipo, urgencia: r.urgencia, total: r.total, eje: r.eje }); } catch { /* dev */ }
  };
  submit?.addEventListener('click', reveal);

  // ---------------- reset ----------------
  const resetToPick = () => {
    seleccion.clear();
    clouds.forEach((c) => { c.setAttribute('aria-pressed', 'false'); c.removeAttribute('data-collapse'); c.style.removeProperty('--to-center'); });
    field?.classList.remove('collapsing');
    flash?.classList.remove('go');
    panelResult?.classList.remove('lit');
    if (panelResult) panelResult.hidden = true;
    if (panelPick) panelPick.hidden = false;
    const urgFill = q<HTMLElement>('[data-dx-urg-fill]'); if (urgFill) urgFill.style.width = '0';
    syncDock();
  };
  q<HTMLButtonElement>('[data-dx-restart]')?.addEventListener('click', resetToPick);

  // ---------------- captura de correo (opcional, no bloqueante) ----------------
  const mail = q<HTMLFormElement>('[data-dx-mail]');
  mail?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = mail.querySelector<HTMLInputElement>('input[type="email"]');
    const email = input?.value?.trim();
    if (!email) return;
    const r = calcular([...seleccion]);
    try {
      const leads = JSON.parse(localStorage.getItem('dx_leads') || '[]');
      leads.push({ email, arquetipo: r.arquetipo, urgencia: r.urgencia, total: r.total, ts: Date.now() });
      localStorage.setItem('dx_leads', JSON.stringify(leads));
    } catch { /* almacenamiento no disponible */ }
    try { track('diagnostico_lead', { arquetipo: r.arquetipo, dominio: email.split('@')[1] ?? '' }); } catch { /* dev */ }
    mail.querySelector('.dx-mail-row')?.classList.add('hidden');
    q<HTMLElement>('[data-dx-mail-ok]')?.removeAttribute('hidden');
  });

  syncDock();
}
