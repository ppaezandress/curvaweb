// Lead magnet: captura el correo, lo manda a un webhook (n8n) y entrega el PDF.
// Idempotente y re-armable en astro:page-load (View Transitions).
// El webhook se configura con la env PUBLIC_LEADMAGNET_WEBHOOK (ver .env.example).
// TODO: pásame la URL del webhook de tu n8n para activar la captura real.
import { track } from '@vercel/analytics';

const PDF = '/checklist-curva.pdf';

export function initLeadMagnet(): void {
  const form = document.getElementById('lm-form') as HTMLFormElement | null;
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const webhook = import.meta.env.PUBLIC_LEADMAGNET_WEBHOOK as string | undefined;
  const status = document.getElementById('lm-status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]') as HTMLInputElement | null;
    const email = input?.value?.trim();
    if (!email) return;

    const btn = form.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    // Captura del lead (no bloquea la entrega si el webhook aún no está configurado).
    try {
      if (webhook) {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'checklist-10-senales', ts: Date.now() }),
        });
      }
    } catch {
      /* la entrega del PDF no debe depender del webhook */
    }

    try { track('lead_checklist', { dominio: email.split('@')[1] ?? '' }); } catch { /* dev */ }

    // Entrega del PDF.
    const a = document.createElement('a');
    a.href = PDF;
    a.download = 'checklist-curva.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();

    form.querySelector('.lm-fields')?.classList.add('hidden');
    if (status) {
      status.classList.remove('hidden');
      status.textContent = '¡Listo! Tu checklist se está descargando. Revisa tu carpeta de descargas.';
    }
  });
}
