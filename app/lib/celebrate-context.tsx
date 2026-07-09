"use client";

import { createContext, useContext, useState } from "react";

// totalSeconds = total invertido en la tarea CONGELADO al momento de cerrarla.
// No lo recalcules en el modal: tras cerrar corre un reload() que reconcilia los
// tramos contra el baseline de Notion, y por el lag de indexado el tramo recién
// cerrado desaparece de sessionSecondsForTask antes de que el baseline lo incluya
// → el total se desplomaría (bug real: 2h de trabajo mostradas como "1m").
type Target = { taskId: string; taskName: string; totalSeconds: number } | null;

type Ctx = {
  celebrating: Target;
  celebrate: (taskId: string, taskName: string, totalSeconds: number) => void;
  dismiss: () => void;
};

const CelebrateContext = createContext<Ctx | null>(null);

export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [celebrating, setCelebrating] = useState<Target>(null);
  return (
    <CelebrateContext.Provider
      value={{
        celebrating,
        celebrate: (taskId, taskName, totalSeconds) => setCelebrating({ taskId, taskName, totalSeconds }),
        dismiss: () => setCelebrating(null),
      }}
    >
      {children}
    </CelebrateContext.Provider>
  );
}

export function useCelebrate() {
  const ctx = useContext(CelebrateContext);
  if (!ctx) throw new Error("useCelebrate dentro de <CelebrateProvider>");
  return ctx;
}
