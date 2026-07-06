// Composer IA inline del hero: responde ahí mismo (no baja al chat de #chat-lm).
// Texto + voz (MediaRecorder → /api/transcribe) + gate de correo inline.
// Placeholder "máquina de escribir" (ghost) que invita a escribir; al mandar,
// pide correo; al responder, enruta a la parte útil del sitio.
// Reutiliza el cliente compartido (lib/chat-client). Idempotente y re-armable.

import { transcribeBlob, sendChat, getLeadEmail, setLeadEmail, type ChatMsg, type ChatLink } from '../lib/chat-client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

// Ejemplos que se escriben solos en el placeholder (guían "qué escribir aquí").
const EXAMPLES = [
  'Pierdo horas registrando mis ventas a mano…',
  'Todo depende de mí, no puedo despegarme del negocio…',
  'Mi información vive regada en WhatsApp y Excel…',
  'Quiero automatizar mi operación pero no sé por dónde…',
];

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
  const chipsRow = chips?.parentElement as HTMLElement | null;
  const emailForm = $<HTMLFormElement>('[data-hero-email-form]');
  const emailInput = $<HTMLInputElement>('[data-hero-email]');
  const emailError = $<HTMLElement>('[data-hero-email-error]');
  const form = $<HTMLFormElement>('[data-hero-form]');
  const field = form; // el <form> ES el campo (.hero-ai-field)
  const input = $<HTMLTextAreaElement>('[data-hero-input]');
  const ghost = $<HTMLElement>('[data-hero-ghost]');
  const ghostText = $<HTMLElement>('[data-hero-ghost-text]');
  const mic = $<HTMLButtonElement>('[data-hero-mic]');
  const send = $<HTMLButtonElement>('[data-hero-send]');
  const status = $<HTMLElement>('[data-hero-status]');
  const scrollHint = document.querySelector<HTMLElement>('[data-hero-scrollhint]');
  if (!log || !chips || !emailForm || !emailInput || !form || !field || !input || !ghost || !ghostText) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let email = getLeadEmail();
  const messages: ChatMsg[] = [];
  let pending = '';
  let busy = false;
  let voiceMode = false;
  let alive = true; // corta bucles async si el nodo se reemplaza (View Transitions)

  // ---------- Placeholder "ghost" (se escribe solo) ----------
  const isActive = () => document.activeElement === input || input.value.trim().length > 0;
  const refreshActive = () => field!.classList.toggle('is-active', isActive());
  // Pausa el typewriter cuando el usuario está en el campo, hay conversación o grabando.
  const twPaused = () => isActive() || voiceMode || !log!.classList.contains('hidden');
  let twRunning = false;

  async function typewriter(): Promise<void> {
    if (twRunning) return;
    twRunning = true;
    if (reduce) { ghostText!.textContent = EXAMPLES[0]; twRunning = false; return; }
    let idx = 0;
    const waitUnpause = async () => { while (alive && twPaused()) { await sleep(220); } };
    while (alive) {
      await waitUnpause();
      if (!alive) return;
      const phrase = EXAMPLES[idx % EXAMPLES.length];
      for (let i = 1; i <= phrase.length; i++) {
        if (!alive) return;
        if (twPaused()) { await waitUnpause(); }
        ghostText!.textContent = phrase.slice(0, i);
        await sleep(40);
      }
      await sleep(1600);
      for (let i = phrase.length; i >= 0; i--) {
        if (!alive) return;
        if (twPaused()) { await waitUnpause(); break; }
        ghostText!.textContent = phrase.slice(0, i);
        await sleep(20);
      }
      idx++;
      await sleep(260);
    }
  }

  input.addEventListener('focus', refreshActive);
  input.addEventListener('blur', refreshActive);

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
  function hideChipsRow() { chipsRow?.classList.add('hidden'); }

  function renderChips(options?: string[]) {
    clearChips();
    if (!options?.length) { hideChipsRow(); return; }
    chipsRow?.classList.remove('hidden');
    for (const opt of options.slice(0, 4)) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'hero-ai-chip';
      c.textContent = opt;
      c.addEventListener('click', () => attemptSend(opt));
      chips!.appendChild(c);
    }
  }

  // Rutas: la IA te LLEVA a la parte útil del sitio (tarjetas claras).
  function renderLinks(links?: ChatLink[]) {
    const valid = (links || []).filter((l) => l.href?.startsWith('/')).slice(0, 3);
    if (!valid.length) return;
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    const wrap = document.createElement('div');
    wrap.className = 'max-w-[92%] w-full';
    const lead = document.createElement('p');
    lead.className = 'text-[12px] font-semibold text-sand-500 mb-1.5 ml-0.5';
    lead.textContent = 'Te llevo aquí 👇';
    wrap.appendChild(lead);
    const list = document.createElement('div');
    list.className = 'flex flex-col gap-1.5';
    for (const l of valid) {
      const a = document.createElement('a');
      a.href = l.href;
      a.className = 'hero-ai-route';
      a.innerHTML =
        '<span class="hero-ai-route-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>' +
        `<span>${l.label}</span>` +
        '<svg class="hero-ai-route-arrow w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5L21 12l-7.5 7.5M21 12H3"/></svg>';
      list.appendChild(a);
    }
    wrap.appendChild(list);
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
    hideChipsRow();
    bubble('user', clean);
    messages.push({ role: 'user', content: clean });
    input!.value = '';
    input!.style.height = 'auto';
    refreshActive();
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
    refreshActive();
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
  // Muestra un estado en el ghost (placeholder) sin romper el typewriter.
  function ghostStatus(msg: string) {
    voiceMode = true;
    field!.classList.remove('is-active');
    ghostText!.textContent = msg;
  }
  function ghostStatusEnd() { voiceMode = false; ghostText!.textContent = ''; refreshActive(); }
  function notify(msg: string) {
    say(msg);
    if (!log!.classList.contains('hidden')) bubble('assistant', msg);
    else { ghostStatus(msg); window.setTimeout(ghostStatusEnd, 2600); }
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
      ghostStatus('Transcribiendo…');
      const r = await transcribeBlob(blob);
      if (r.text) {
        voiceMode = false;
        input!.value = r.text;
        input!.style.height = 'auto';
        input!.style.height = Math.min(input!.scrollHeight, 160) + 'px';
        refreshActive();
        input!.focus();
        say('Listo, revisa el texto y pregunta.');
      } else {
        ghostStatusEnd();
        notify(r.error || 'No te entendí el audio. ¿Lo escribes?');
      }
    };
    recorder.start();
    recording = true;
    mic.classList.add('recording');
    mic.setAttribute('aria-pressed', 'true');
    ghostStatus('Grabando… toca de nuevo para terminar');
    say('Grabando.');
  }
  mic?.addEventListener('click', toggleMic);

  // ---------- Arranque ----------
  refreshActive();
  void typewriter();

  // ---------- Cleanup en navegación (View Transitions) ----------
  document.addEventListener('astro:before-swap', () => {
    alive = false;
    try { if (recording && recorder) recorder.stop(); } catch { /* noop */ }
    stream?.getTracks().forEach((tr) => tr.stop());
  }, { once: true });
}
