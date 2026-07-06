// Fuente única del WhatsApp de CURVA. Cambiar el número SOLO aquí.
// ⚠️ TODO: reemplazar por el número de WhatsApp de CURVA (hoy es placeholder personal).
export const WHATSAPP = '5215611846200';

// Construye el link de WhatsApp con mensaje pre-llenado (saludo friendly con emoji).
export const waLink = (text = 'Hola 👋, me interesa saber más sobre CURVA'): string =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

// Para mostrar el número formateado (footer, etc.).
export const WHATSAPP_DISPLAY = '+52 56 1184 6200';
