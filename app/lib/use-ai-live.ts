"use client";

import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export type AILive = { live: boolean; project?: string; startedAt?: number };

// Estado de IA en vivo (Claude Code/Desktop trabajando), por PUSH (Supabase Realtime broadcast)
// con respaldo por polling lento (por si el broadcast no llega).
export function useAILive(email?: string): AILive {
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

    refetch(); // estado inicial

    // PUSH: cambia al instante cuando la IA arranca/termina.
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

    // Respaldo lento: corrige si algún push se perdió.
    const id = setInterval(refetch, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (sb && sub) sb.removeChannel(sub);
    };
  }, [email]);

  return state;
}
