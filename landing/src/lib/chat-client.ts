// Cliente compartido del asistente IA (navegador). Único lugar que habla con
// /api/transcribe y /api/chat, para que el composer del hero y el chat de abajo
// (#chat-lm) reutilicen la misma lógica.
//
// ⚠️ REGLA DE ORO: ambos endpoints pueden devolver un fallo con HTTP 200
// ({ error } en el body). Nunca confíes en res.ok — inspecciona el body.

export interface ChatMsg { role: 'user' | 'assistant'; content: string }
export interface ChatLink { label: string; href: string }
export interface ChatResponse {
  reply: string;
  options?: string[];      // ≤4 chips de respuesta rápida
  links?: ChatLink[];      // ≤3, site-relative
  cta?: 'schedule';
  calLink: string;
}
export interface TranscribeResult { text?: string; error?: string }

const CAL_FALLBACK = 'https://cal.com/andres-paez/30min';
const MAX_AUDIO = 8 * 1024 * 1024; // el endpoint responde 413 por encima

export async function transcribeBlob(blob: Blob): Promise<TranscribeResult> {
  if (blob.size > MAX_AUDIO) return { error: 'El audio es muy largo. Intenta uno más corto.' };
  try {
    const fd = new FormData();
    // El endpoint valida por file.type; MediaRecorder ya reporta un MIME válido.
    fd.append('audio', blob, 'audio.webm');
    const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (text) return { text };
    return { error: (typeof data?.error === 'string' && data.error) || 'No pude transcribir el audio.' };
  } catch {
    return { error: 'No pude procesar el audio.' };
  }
}

export async function sendChat(email: string, messages: ChatMsg[]): Promise<ChatResponse> {
  const fallback: ChatResponse = {
    reply: 'Se me fue la señal. Intenta de nuevo o agenda una llamada.',
    cta: 'schedule',
    calLink: CAL_FALLBACK,
  };
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, messages }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    // El server siempre da un body usable en 200/429 (reply+cta). Sólo si falta
    // reply de plano, usamos el fallback.
    if (data && typeof data.reply === 'string') {
      return {
        reply: data.reply,
        options: Array.isArray(data.options) ? data.options : undefined,
        links: Array.isArray(data.links) ? data.links : undefined,
        cta: data.cta === 'schedule' ? 'schedule' : undefined,
        calLink: typeof data.calLink === 'string' && data.calLink ? data.calLink : CAL_FALLBACK,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ---- Store de correo (compartido hero ↔ #chat-lm; sin re-pedirlo) ----
const KEY = 'curva:lead-email';
export function getLeadEmail(): string {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function setLeadEmail(email: string): void {
  try { sessionStorage.setItem(KEY, email); } catch { /* modo privado, ignora */ }
}
