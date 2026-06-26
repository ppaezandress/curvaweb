// Recortes de scope del PILOTO interno. Gateados (no borrados) para reactivar fácil:
// basta poner la env en "1" y rebuild. Decididos en la junta de equipo: no sesgar al
// equipo mostrándoles cosas que estamos probando si siquiera piden.
export const PILOT = {
  // Q&A de ida y vuelta con Curvi ("Pregúntale a Curvi"). Off en el piloto: Curvi SOLO
  // muestra recomendaciones/insights; el usuario no le escribe.
  curviChat: process.env.NEXT_PUBLIC_CURVI_CHAT === "1",
  // Todo el encuadre de "Tiempo con IA" (toggle, tarjeta de IA, botón ✨IA, dock de IA).
  // Off en el piloto: no insinuamos "mides con IA o no".
  aiTime: process.env.NEXT_PUBLIC_AI_TIME === "1",
  // Herramientas de dev/admin (ej. botón "Sincronizar a Postgres"). Off para usuarios del piloto.
  devTools: process.env.NEXT_PUBLIC_DEV_TOOLS === "1",
  // Chat in-app (Mensajes). Off en el piloto: el feedback va por WhatsApp, no es el canal.
  // Gateado y reversible; la ruta y los datos siguen intactos.
  messages: process.env.NEXT_PUBLIC_MESSAGES === "1",
};
