// Compra de plantillas de Notion: pagas aquí mismo → te llega al correo.
// Andamiaje (Pendiente #1): pide el correo con un mini-form inline y llama a
// /api/checkout. Si el proveedor devuelve URL de pago, redirige; si no, muestra
// el mensaje de "te llega al correo".

export function initCheckout() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-comprar]');
  buttons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';

    btn.addEventListener('click', () => {
      const card = btn.closest('div');
      if (!card || card.querySelector('[data-buy-form]')) return;
      const plantilla = btn.dataset.comprar || '';
      const nombre = btn.dataset.nombre || '';
      const monto = Number(btn.dataset.monto || 0);

      // Mini-form inline (muy fácil): correo + confirmar.
      const wrap = document.createElement('div');
      wrap.dataset.buyForm = '1';
      wrap.className = 'mt-4 flex flex-col gap-2';
      wrap.innerHTML = `
        <input type="email" required placeholder="tu@correo.com" aria-label="Tu correo"
          class="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-sand-50 placeholder:text-sand-500 focus:border-ember-300 focus:outline-none" />
        <button type="button" class="btn-pop text-sm font-semibold bg-ember text-white px-5 py-2.5 rounded-full hover:bg-ember-600">Confirmar compra</button>
        <p data-buy-msg class="text-xs text-sand-400"></p>`;
      btn.replaceWith(wrap);

      const emailEl = wrap.querySelector('input') as HTMLInputElement;
      const confirmEl = wrap.querySelector('button') as HTMLButtonElement;
      const msgEl = wrap.querySelector('[data-buy-msg]') as HTMLElement;
      emailEl.focus();

      confirmEl.addEventListener('click', async () => {
        const email = emailEl.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msgEl.textContent = 'Escribe un correo válido.'; return; }
        confirmEl.disabled = true;
        msgEl.textContent = 'Procesando…';
        try {
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plantilla, nombre, monto, email }),
          });
          const data = await res.json().catch(() => ({}));
          if (data.url) { window.location.href = data.url; return; }
          msgEl.textContent = data.message || data.error || 'Listo, te escribimos al correo.';
        } catch {
          msgEl.textContent = 'No se pudo completar. Intenta de nuevo.';
          confirmEl.disabled = false;
        }
      });
    });
  });
}
