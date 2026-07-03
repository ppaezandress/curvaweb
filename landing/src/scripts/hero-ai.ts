// Composer IA inline del hero: responde ahí mismo (no baja al chat de #chat-lm).
// Texto + voz (MediaRecorder → /api/transcribe) + gate de correo inline.
// Reutiliza el cliente compartido (lib/chat-client). Idempotente y re-armable.

import { transcribeBlob, sendChat, getLeadEmail, setLeadEmail, type ChatMsg, type ChatLink } from '../lib/chat-client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  for (const c of ['audio/webm', 'audio/mp4', 'audio/x-m4a']) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

export function initHeroAI(): void {
  const root = document.getElementById('hero-ai');
  if (!root || root.dataset.init === '1') return;
  root.dataset.init = '1';

  const calLink = root.dataset.calLink || 'https://cal.com/andres-paez/30min';
  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;

  const log = $<HTMLElement>('[data-hero-log]');
  const chips = $<HTMLElement>('[data-hero-chips]');
  const emailForm = $<HTMLFormElement>('[data-hero-email-form]');
  const emailInput = $<HTMLInputElement>('[data-hero-email]');
  const emailError = $<HTMLElement>('[data-hero-email-error]');
  const form = $<HTMLFormElement>('[data-hero-form]');
  const input = $<HTMLTextAreaElement>('[data-hero-input]');
  const mic = $<HTMLButtonElement>('[data-hero-mic]');
  const send = $<HTMLButtonElement>('[data-hero-send]');
  const status = $<HTMLElement>('[data-hero-status]');
  const scrollHint = document.querySelector<HTMLElement>('[data-hero-scrollhint]');
  if (!log || !chips || !emailForm || !emailInput || !form || !input) return;

  let email = getLeadEmail();
  const messages: ChatMsg[] = [];
  let pending = '';
  let busy = false;

  // ---------- Helpers de render (mismo lenguaje que el chat de abajo) ----------
  const scroll = () => { log!.scrollTop = log!.scrollHeight; };

  function revealLog(): void {
    if (log!.classList.contains('hidden')) log!.classList.remove('hidden');
    scrollHint?.classList.add('hidden'); // deja de invitar a bajar cuando ya hay conversación
  }

  function bubble(role: 'user' | 'assistant', text: string): void {
    revealLog();
    const row = document.createElement('div');
    row.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';
    const b = document.createElement('div');
    b.className = role === 'user'
      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-ember text-white px-4 py-2.5 text-[15px] leading-relaxed'
      : 'max-w-[85%] rounded-2xl rounded-bl-md bg-sand-100 border border-sand-200 text-ink px-4 py-2.5 text-[15px] leading-relaxed';
    b.textContent = text;
    row.appendChild(b);
    log!.appendChild(row);
    scroll();
  }

  function typing(): HTMLElement {
    revealLog();
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    row.innerHTML = '<div class="rounded-2xl rounded-bl-md bg-sand-100 border border-sand-200 px-4 py-3 flex gap-1"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    log!.appendChild(row);
    scroll();
    return row;
  }

  function clearChips() { chips!.innerHTML = ''; }

  function renderChips(options?: string[]) {
    clearChips();
    if (!options?.length) return;
    for (const opt of options.slice(0, 4)) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'text-[13px] font-medium text-sand-600 border border-sand-300 rounded-full px-3.5 py-1.5 hover:border-ember hover:text-ember transition-colors';
      c.textContent = opt;
      c.addEventListener('click', () => attemptSend(opt));
      chips!.appendChild(c);
    }
  }

  function renderLinks(links?: ChatLink[]) {
    if (!links?.length) return;
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    const wrap = document.createElement('div');
    wrap.className = 'max-w-[85%] flex flex-wrap gap-2';
    for (const l of links.slice(0, 3)) {
      if (!l.href?.startsWith('/')) continue; // sólo site-relative
      const a = document.createElement('a');
      a.href = l.href;
      a.className = 'inline-flex items-center gap-1.5 text-sm font-semibold text-ember border border-ember/30 bg-ember/10 rounded-full px-3.5 py-1.5 hover:bg-ember/20 transition-colors';
      a.innerHTML = `${l.label} <span aria-hidden="true">→</span>`;
      wrap.appendChild(a);
    }
    if (!wrap.children.length) return;
    row.appendChild(wrap);
    log!.appendChild(row);
    scroll();
  }

  function renderCta(link: string) {
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'btn-pop inline-flex items-center gap-2 text-sm font-semibold bg-ember text-white px-5 py-2.5 rounded-full hover:bg-ember-600';
    a.innerHTML = 'Agendar llamada <span aria-hidden="true">→</span>';
    row.appendChild(a);
    log!.appendChild(row);
    scroll();
  }

  function setBusy(v: boolean) {
    busy = v;
    if (send) send.disabled = v;
  }

  // ---------- Envío ----------
  async function doSend(text: string): Promise<void> {
    const clean = text.trim().slice(0, 1500);
    if (!clean || busy) return;
    setBusy(true);
    clearChips();
    bubble('user', clean);
    messages.push({ role: 'user', content: clean });
    input!.value = '';
    input!.style.height = 'auto';
    const t = typing();
    const data = await sendChat(email, messages.slice(-16));
    t.remove();
    bubble('assistant', data.reply);
    messages.push({ role: 'assistant', content: data.reply });
    renderLinks(data.links);
    if (data.cta === 'schedule') renderCta(data.calLink || calLink);
    renderChips(data.options);
    setBusy(false);
    input!.focus();
  }

  // Puerta de entrada: si aún no hay correo, pide correo inline y guarda el mensaje.
  function attemptSend(text: string): void {
    const v = text.trim();
    if (!v || busy) return;
    if (email) { void doSend(v); return; }
    pending = v;
    emailForm!.classList.remove('hidden');
    if (emailError) { emailError.classList.add('hidden'); emailError.textContent = ''; }
    window.setTimeout(() => emailInput!.focus({ preventScroll: true }), 60);
  }

  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = emailInput!.value.trim().toLowerCase();
    if (!EMAIL_RE.test(val)) {
      if (emailError) { emailError.textContent = 'Escribe un correo válido.'; emailError.classList.remove('hidden'); }
      return;
    }
    email = val;
    setLeadEmail(val); // lo comparte con el chat de abajo (#chat-lm)
    emailForm!.classList.add('hidden');
    const p = pending; pending = '';
    if (p) void doSend(p); else input!.focus();
  });

  // ---------- Composer (texto) ----------
  form.addEventListener('submit', (e) => { e.preventDefault(); attemptSend(input!.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); attemptSend(input!.value); }
  });
  input.addEventListener('input', () => {
    input!.style.height = 'auto';
    input!.style.height = Math.min(input!.scrollHeight, 160) + 'px';
  });
  root.querySelectorAll<HTMLElement>('[data-hero-chip]').forEach((c) =>
    c.addEventListener('click', () => attemptSend(c.textContent || ''))
  );

  // ---------- Voz (MediaRecorder → /api/transcribe) ----------
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: BlobPart[] = [];
  let recording = false;

  const say = (msg: string) => { if (status) status.textContent = msg; };
  function notify(msg: string) {
    say(msg);
    if (!log!.classList.contains('hidden')) bubble('assistant', msg);
    else { const prev = input!.placeholder; input!.placeholder = msg; window.setTimeout(() => { input!.placeholder = prev; }, 2600); }
  }

  async function toggleMic() {
    if (!mic) return;
    if (recording && recorder) { recorder.stop(); return; }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      notify('Tu navegador no permite grabar aquí. Escríbelo mejor 🙂');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      notify('No me diste permiso del micrófono. Puedes escribir tu mensaje.');
      return;
    }
    const mime = pickMime();
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    recorder.onstop = async () => {
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
      recording = false;
      mic!.classList.remove('recording');
      mic!.setAttribute('aria-pressed', 'false');
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
      say('Transcribiendo…');
      input!.placeholder = 'Transcribiendo…';
      const r = await transcribeBlob(blob);
      input!.placeholder = 'Describe tu problema… o manda un audio';
      if (r.text) {
        input!.value = r.text;
        input!.style.height = 'auto';
        input!.style.height = Math.min(input!.scrollHeight, 160) + 'px';
        input!.focus();
        say('Listo, revisa el texto y pregunta.');
      } else {
        notify(r.error || 'No te entendí el audio. ¿Lo escribes?');
      }
    };
    recorder.start();
    recording = true;
    mic.classList.add('recording');
    mic.setAttribute('aria-pressed', 'true');
    input!.placeholder = 'Grabando… toca de nuevo para terminar';
    say('Grabando.');
  }
  mic?.addEventListener('click', toggleMic);

  // ---------- Cleanup en navegación (View Transitions) ----------
  document.addEventListener('astro:before-swap', () => {
    try { if (recording && recorder) recorder.stop(); } catch { /* noop */ }
    stream?.getTracks().forEach((tr) => tr.stop());
  }, { once: true });
}
