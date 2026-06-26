// Curvi · sugerencias al crear una tarea. Hoy es una heurística determinista (simulación
// 10x); mañana esta función se reemplaza por una llamada a Claude sin tocar a quien la usa.
// Lee el texto de la tarea e infiere prioridad, esfuerzo y fecha sugeridos.

type Priority = "Baja" | "Media" | "Alta";
type Weight = "Ligera" | "Media" | "Pesada";

function isoInDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function curviTaskDefaults(name: string): { priority: Priority; weight: Weight; due: string } {
  const n = (name || "").toLowerCase();

  // Prioridad: señales de urgencia/importancia en el texto.
  let priority: Priority = "Media";
  if (/\b(urge|urgente|hoy|ya|asap|deadline|entrega|cierre|importante|crític)/.test(n)) priority = "Alta";
  else if (/\b(algún día|cuando pueda|opcional|idea|explorar|tal vez|quizá|backlog)/.test(n)) priority = "Baja";

  // Esfuerzo: verbos ligeros vs. pesados.
  let weight: Weight = "Media";
  if (/\b(revisar|revisa|check|leer|responder|contestar|correo|mail|llamar|ping|avisar|recordar|agendar|enviar|mandar)/.test(n)) weight = "Ligera";
  else if (/\b(diseñar|construir|desarrollar|crear|armar|planear|plan|estrategia|deck|propuesta|analizar|investiga|migrar|implementar|escribir|redactar|documento|manual)/.test(n)) weight = "Pesada";

  // Fecha sugerida: solo si el texto la insinúa (no forzamos fecha si no hay señal).
  let due = "";
  if (/\b(hoy|urge|asap)/.test(n)) due = isoInDays(0);
  else if (/\bmañana/.test(n)) due = isoInDays(1);
  else if (/\b(esta semana|fin de semana|viernes)/.test(n)) due = isoInDays(5);

  return { priority, weight, due };
}
