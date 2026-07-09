// Abrir el modal de "Registrar tiempo" desde cualquier lugar (dashboard, TaskCard,
// detalle de tarea), opcionalmente con una tarea ya seleccionada. El modal se monta una
// sola vez en el layout (ManualEntryHost) y escucha este evento.
export const MANUAL_ENTRY_EVENT = "curva:manual-entry";

export function openManualEntry(taskId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MANUAL_ENTRY_EVENT, { detail: { taskId } }));
}
