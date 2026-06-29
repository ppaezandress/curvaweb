// Números que cuentan al entrar en viewport (estilo Pitch/Framer).
// Marca cualquier elemento con [data-count="<valor>"]; respeta prefijo/sufijo
// (15+, 2,300+, 4 meses…) y salta los no-numéricos (24/7, Auto).
// Idempotente y re-armable en astro:page-load (View Transitions).
let countObserver: IntersectionObserver | null = null;

interface Parsed { prefix: string; num: number; suffix: string; comma: boolean; }

function parse(raw: string): Parsed | null {
  const m = raw.match(/^(\D*)([\d.,]+)(.*)$/);
  if (!m) return null;
  const suffix = m[3];
  if (suffix.includes('/')) return null; // ej. 24/7 → estático
  const num = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(num)) return null;
  return { prefix: m[1], num, suffix, comma: m[2].includes(',') };
}

const fmt = (n: number, comma: boolean) =>
  comma ? Math.round(n).toLocaleString('en-US') : String(Math.round(n));

export function initCount(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  if (!els.length) return;

  const run = (el: HTMLElement) => {
    const raw = el.dataset.count ?? el.textContent ?? '';
    const p = parse(raw);
    if (!p) return;
    if (reduce) { el.textContent = raw; return; }
    const dur = 1300;
    let start = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min((now - start) / dur, 1);
      el.textContent = `${p.prefix}${fmt(p.num * ease(t), p.comma)}${p.suffix}`;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = raw;
    };
    requestAnimationFrame(tick);
  };

  countObserver?.disconnect();
  countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          run(e.target as HTMLElement);
          countObserver?.unobserve(e.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  els.forEach((el) => {
    const p = parse(el.dataset.count ?? '');
    if (p && !reduce) el.textContent = `${p.prefix}0${p.suffix}`; // arranca en 0
    countObserver?.observe(el);
  });
}
