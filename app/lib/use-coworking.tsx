"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// Detecta en vivo cuándo trabajas la MISMA tarea que otra persona (vía presence) y,
// al terminar el solape, registra la "sesión compartida" en Supabase. Dedup: solo el
// participante con el uuid menor (user_a) escribe la fila. El total compartido NO se
// suma a Notion (cada cronómetro ya registra el tiempo individual de cada quién).
export type CoworkPartner = { uid: string; name: string; avatarUrl: string | null };
const CoworkingCtx = createContext<{ partners: CoworkPartner[] }>({ partners: [] });

type PresenceRow = { user_id: string; is_active: boolean; current_task_id: string | null; updated_at: string };
type ProfileRow = { id: string; name: string; avatar_url: string | null };

const ONLINE_MS = 90_000;
const onlineRecently = (u: string) => Date.now() - new Date(u).getTime() < ONLINE_MS;

export function CoworkingProvider({ children }: { children: React.ReactNode }) {
  const { active } = useApp();
  const { taskById } = useData();
  const [partners, setPartners] = useState<CoworkPartner[]>([]);

  const myUid = useRef<string | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const taskByIdRef = useRef(taskById);
  taskByIdRef.current = taskById;
  const profilesRef = useRef<Record<string, ProfileRow>>({});
  // Solapes en curso: otherUid -> { taskId, startedAt(ms) }
  const overlaps = useRef<Map<string, { taskId: string; startedAt: number }>>(new Map());
  const evaluateRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    let sub: ReturnType<typeof sb.channel> | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    const loadProfiles = async () => {
      const { data } = await sb.from("profiles").select("id,name,avatar_url");
      const map: Record<string, ProfileRow> = {};
      (data || []).forEach((p: ProfileRow) => (map[p.id] = p));
      profilesRef.current = map;
    };

    // Registra una sesión compartida que terminó. Solo el uuid menor escribe (dedup).
    const recordEnded = (otherUid: string, taskId: string, startedAt: number, endedAt: number) => {
      const me = myUid.current;
      if (!me || me >= otherUid) return;
      const minutes = Math.round((endedAt - startedAt) / 60000);
      if (minutes < 1) return;
      sb.from("coworking_sessions").insert({
        task_id: taskId,
        task_name: taskByIdRef.current[taskId]?.name ?? null,
        user_a: me,
        user_b: otherUid,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        minutes,
      }).then(() => {});
    };

    const evaluate = async () => {
      if (!myUid.current) {
        const { data } = await sb.auth.getUser();
        myUid.current = data.user?.id ?? null;
        if (!myUid.current) return;
      }
      const myTask = activeRef.current?.taskId ?? null;
      const { data: pres } = await sb.from("presence").select("user_id,is_active,current_task_id,updated_at");
      const now = Date.now();
      const current = new Set<string>();
      const list: CoworkPartner[] = [];
      if (myTask) {
        for (const p of (pres as PresenceRow[]) || []) {
          if (p.user_id === myUid.current) continue;
          if (p.is_active && p.current_task_id === myTask && onlineRecently(p.updated_at)) {
            current.add(p.user_id);
            const prof = profilesRef.current[p.user_id];
            list.push({ uid: p.user_id, name: prof?.name || "Alguien", avatarUrl: prof?.avatar_url ?? null });
          }
        }
      }
      // Nuevos solapes
      current.forEach((uid) => {
        if (!overlaps.current.has(uid)) overlaps.current.set(uid, { taskId: myTask!, startedAt: now });
      });
      // Solapes terminados (ya no estamos juntos en la misma tarea)
      for (const [uid, ov] of [...overlaps.current.entries()]) {
        if (!current.has(uid) || ov.taskId !== myTask) {
          overlaps.current.delete(uid);
          recordEnded(uid, ov.taskId, ov.startedAt, now);
        }
      }
      if (!cancelled) setPartners(list);
    };
    evaluateRef.current = evaluate;

    loadProfiles().then(evaluate);
    sub = sb.channel("coworking-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, () => evaluate())
      .subscribe();
    timer = setInterval(evaluate, 20000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (sub) sb.removeChannel(sub);
      // Cierra solapes abiertos al desmontar (cambio de página interno no desmonta el layout).
      const now = Date.now();
      for (const [uid, ov] of overlaps.current.entries()) recordEnded(uid, ov.taskId, ov.startedAt, now);
      overlaps.current.clear();
    };
  }, []);

  // Reacciona de inmediato a cambios de TU tarea activa (sin esperar al intervalo).
  useEffect(() => { evaluateRef.current(); }, [active]);

  return <CoworkingCtx.Provider value={{ partners }}>{children}</CoworkingCtx.Provider>;
}

export function useCoworking() {
  return useContext(CoworkingCtx);
}
