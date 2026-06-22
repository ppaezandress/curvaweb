"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export type AILive = { live: boolean; project?: string; startedAt?: number };

// UN solo canal Realtime compartido por toda la app (varios suscriptores al mismo
// topic "ai-live" se pisan entre sí; por eso un único provider).
const Ctx = createContext<AILive>({ live: false });

export function AILiveProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const email = me?.email;
  const [state, setState] = useState<AILive>({ live: false });

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const e = email.toLowerCase();

    const refetch = () =>
      fetch(`/api/timing/live?u=${encodeURIComponent(email)}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const a = (d.active || [])[0];
          setState(a ? { live: true, project: a.project, startedAt: a.startedAt } : { live: false });
        })
        .catch(() => {});

    refetch();

    const sb = supabaseConfigured() ? getSupabase() : null;
    let sub: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;
    if (sb) {
      sub = sb
        .channel("ai-live")
        .on("broadcast", { event: "ai" }, ({ payload }: { payload: { email?: string; event?: string; project?: string; startedAt?: number } }) => {
          if (!payload || (payload.email || "").toLowerCase() !== e) return;
          if (payload.event === "start") setState({ live: true, project: payload.project, startedAt: payload.startedAt });
          else if (payload.event === "stop") setState({ live: false });
        })
        .subscribe();
    }

    const id = setInterval(refetch, 8000); // respaldo lento

    return () => {
      cancelled = true;
      clearInterval(id);
      if (sb && sub) sb.removeChannel(sub);
    };
  }, [email]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAILive(): AILive {
  return useContext(Ctx);
}
