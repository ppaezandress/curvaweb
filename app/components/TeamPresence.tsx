"use client";

import { useEffect, useState, useCallback } from "react";
import { Music, Circle } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

type Presence = {
  user_id: string;
  is_active: boolean;
  current_task: string | null;
  app_focus: string | null;
  track: string | null;
  artist: string | null;
  updated_at: string;
};
type Profile = { id: string; name: string; avatar_url: string | null };

function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}
function onlineRecently(updated: string) {
  return Date.now() - new Date(updated).getTime() < 90_000; // 90s
}

export function TeamPresence() {
  const sb = getSupabase();
  const [rows, setRows] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: pres }, { data: profs }] = await Promise.all([
      sb.from("presence").select("*"),
      sb.from("profiles").select("id,name,avatar_url"),
    ]);
    setRows((pres as Presence[]) || []);
    const map: Record<string, Profile> = {};
    (profs || []).forEach((p: Profile) => (map[p.id] = p));
    setProfiles(map);
  }, [sb]);

  useEffect(() => {
    if (!supabaseConfigured() || !sb) return;
    load();
    const sub = sb.channel("presence-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, () => load())
      .subscribe();
    const id = setInterval(load, 30000); // refresca "online" por tiempo
    return () => { sb.removeChannel(sub); clearInterval(id); };
  }, [sb, load]);

  if (!supabaseConfigured()) return null;

  const sorted = [...rows].sort((a, b) => Number(onlineRecently(b.updated_at)) - Number(onlineRecently(a.updated_at)));

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Equipo</h3>
      <div className="space-y-3">
        {sorted.map((r) => {
          const prof = profiles[r.user_id];
          const online = onlineRecently(r.updated_at);
          return (
            <div key={r.user_id} className="flex items-start gap-2.5">
              <div className="relative">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-curva-purple/15 text-xs font-bold text-curva-purple">
                  {prof?.avatar_url ? <img src={prof.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(prof?.name || "?")}
                </span>
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${r.is_active ? "bg-curva-teal" : online ? "bg-amber-400" : "bg-zinc-300"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{prof?.name || "—"}</p>
                <p className="truncate text-xs text-zinc-500">
                  {r.is_active ? (r.current_task ? `⏱ ${r.current_task}` : "trabajando") : online ? "en línea" : "desconectado"}
                </p>
                {r.track && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#1DB954]">
                    <Music size={11} className="shrink-0" /> {r.track}{r.artist ? ` · ${r.artist}` : ""}
                  </p>
                )}
                {r.app_focus && !r.track && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">{r.app_focus}</p>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-zinc-400">Nadie en línea aún.</p>}
      </div>
    </div>
  );
}
