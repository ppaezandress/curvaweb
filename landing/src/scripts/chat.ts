// Cliente del chat lead magnet. Gate de correo → conversación con /api/chat.
// Soporta texto y audios (MediaRecorder → /api/transcribe). Chips de opción
// múltiple, deep-links y CTA para agendar. Extensible a imágenes (no implementado).

import { sendChat, transcribeBlob, getLeadEmail, setLeadEmail } from '../lib/chat-client';

interface Msg { role: 'user' | 'assistant'; content: string; }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initChat() {
  const root = document.getElementById('chat-lm');
  if (!root || root.dataset.init === '1') return;
  root.dataset.init = '1';

  const calLink = root.dataset.calLink || 'https://cal.com/andres-paez/30min';
  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;

  const gate = $<HTMLFormElement>('[data-chat-gate]');
  const emailInput = $<HTMLInputElement>('[data-chat-email]');
  const gateError = $<HTMLElement>('[data-chat-gate-error]');
  const panel = $<HTMLElement>('[data-chat-panel]');
  const log = $<HTMLElement>('[data-chat-log]');
  const chips = $<HTMLElement>('[data-chat-chips]');
  const form = $<HTMLFormElement>('[data-chat-form]');
  const input = $<HTMLTextAreaElement>('[data-chat-input]');
  const mic = $<HTMLButtonElement>('[data-chat-mic]');
  if (!gate || !emailInput || !panel || !log || !chips || !form || !input) return;

  let email = '';
  const messages: Msg[] = [];
  let busy = false;

  // ---- Render helpers ----
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
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
    return b;
  }

  function typing(): HTMLElement {
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
    for (const opt of options) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'text-sm font-medium text-sand-600 border border-sand-300 rounded-full px-3.5 py-1.5 hover:border-ember hover:text-ember transition-colors';
      c.textContent = opt;
      c.addEventListener('click', () => { if (!busy) send(opt); });
      chips!.appendChild(c);
    }
  }

  function renderLinks(links?: { label: string; href: string }[]) {
    if (!links?.length) return;
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    const wrap = document.createElement('div');
    wrap.className = 'max-w-[85%] flex flex-wrap gap-2';
    for (const l of links) {
      const a = document.createElement('a');
      a.href = l.href;
      a.className = 'inline-flex items-center gap-1.5 text-sm font-semibold text-ember border border-ember/30 bg-ember/10 rounded-full px-3.5 py-1.5 hover:bg-ember/20 transition-colors';
      a.innerHTML = `${l.label} <span aria-hidden="true">→</span>`;
      wrap.appendChild(a);
    }
    row.appendChild(wrap);
    log!.appendChild(row);
    scroll();
  }

  function renderCta() {
    const row = document.createElement('div');
    row.className = 'flex justify-start';
    const a = document.createElement('a');
    a.href = calLink;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'btn-pop inline-flex items-center gap-2 text-sm font-semibold bg-ember text-white px-5 py-2.5 rounded-full hover:bg-ember-600';
    a.innerHTML = 'Agendar llamada <span aria-hidden="true">→</span>';
    row.appendChild(a);
    log!.appendChild(row);
    scroll();
  }

  // ---- Envío ----
  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    busy = true;
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
    if (data.cta === 'schedule') renderCta();
    renderChips(data.options);
    busy = false;
    input!.focus();
  }

  // ---- Gate (o salto si ya hay correo capturado en el hero) ----
  function openPanel(greeting: string) {
    gate!.style.display = 'none';
    panel!.hidden = false;
    bubble('assistant', greeting);
    renderChips(['Mi equipo hace todo manual', 'Dependo de mí para todo', 'Quiero vender más en línea', 'No sé por dónde empezar']);
    input!.focus();
  }

  const saved = getLeadEmail();
  if (saved) {
    email = saved;
    openPanel('¡Qué bueno verte otra vez! Cuéntame en qué andas y te digo cómo te ayudamos.');
  }

  gate.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = emailInput.value.trim().toLowerCase();
    if (!EMAIL_RE.test(val)) {
      if (gateError) { gateError.textContent = 'Escribe un correo válido.'; gateError.classList.remove('hidden'); }
      return;
    }
    email = val;
    setLeadEmail(val); // compartido con el composer del hero
    openPanel('¡Hola! Cuéntame qué está pasando en tu operación y te digo cómo te podemos ayudar.');
  });

  // ---- Form (texto) ----
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
  });

  // ---- Audio (MediaRecorder → /api/transcribe) ----
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let recording = false;

  async function toggleMic() {
    if (!mic) return;
    if (recording && recorder) { recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      bubble('assistant', 'Tu navegador no deja grabar audio aquí. Escríbelo mejor 🙂');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        recording = false;
        mic!.classList.remove('recording');
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
        input!.placeholder = 'Transcribiendo…';
        const r = await transcribeBlob(blob);
        input!.placeholder = 'Escribe tu problema…';
        if (r.text) { input!.value = r.text; input!.focus(); }
        else bubble('assistant', r.error || 'No te entendí el audio. ¿Lo escribes?');
      };
      recorder.start();
      recording = true;
      mic.classList.add('recording');
    } catch {
      bubble('assistant', 'No me diste permiso del micrófono. Puedes escribir tu mensaje.');
    }
  }
  mic?.addEventListener('click', toggleMic);
}
