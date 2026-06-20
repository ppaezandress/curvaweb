"use client";

import { createContext, useContext, useState } from "react";

type Target = { taskId: string; taskName: string } | null;

type Ctx = {
  celebrating: Target;
  celebrate: (taskId: string, taskName: string) => void;
  dismiss: () => void;
};

const CelebrateContext = createContext<Ctx | null>(null);

export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [celebrating, setCelebrating] = useState<Target>(null);
  return (
    <CelebrateContext.Provider
      value={{
        celebrating,
        celebrate: (taskId, taskName) => setCelebrating({ taskId, taskName }),
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
