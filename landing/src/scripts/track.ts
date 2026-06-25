// Instrumentación de conversión: clics al CTA de agendar (Cal.com) y a WhatsApp.
// Delegación global en `document` → se enlaza UNA sola vez y sobrevive a las
// View Transitions (el guard idempotente evita doble binding en astro:page-load).
// En dev `track` no envía nada (solo modo debug); en producción Vercel sí reporta.
import { track } from '@vercel/analytics';

let bound = false;

export function initTracking(): void {
  if (bound) return;
  bound = true;

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      const texto = (a.textContent ?? '').trim().slice(0, 40) || undefined;

      if (href.includes('cal.com')) {
        track('cta_agendar', { texto, ruta: location.pathname });
      } else if (href.includes('wa.me')) {
        track('cta_whatsapp', { texto, ruta: location.pathname });
      }
    },
    { capture: true }
  );
}
