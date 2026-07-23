// Fuente única del WhatsApp de CURVA. Cambiar el número SOLO aquí.
// Número de negocio de CURVA (wa.me usa 52 + 1 + 10 dígitos para México).
export const WHATSAPP = '5215656128989';

// Construye el link de WhatsApp con mensaje pre-llenado (saludo friendly con emoji).
export const waLink = (text = 'Hola 👋, me interesa saber más sobre CURVA'): string =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

// Para mostrar el número formateado (footer, etc.).
export const WHATSAPP_DISPLAY = '+52 56 5612 8989';
