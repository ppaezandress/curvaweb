"use client";

import { useEffect, useState } from "react";
import { ManualEntryModal } from "@/components/ManualEntryModal";
import { MANUAL_ENTRY_EVENT } from "@/lib/manual-entry";

// Monta el modal de "Registrar tiempo" una sola vez para toda la app y lo abre cuando
// cualquier pantalla dispara MANUAL_ENTRY_EVENT (con o sin tarea preseleccionada).
export function ManualEntryHost() {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId?: string }>).detail;
      setTaskId(detail?.taskId);
      setOpen(true);
    };
    window.addEventListener(MANUAL_ENTRY_EVENT, onOpen);
    return () => window.removeEventListener(MANUAL_ENTRY_EVENT, onOpen);
  }, []);

  return <ManualEntryModal open={open} onClose={() => setOpen(false)} presetTaskId={taskId} />;
}
