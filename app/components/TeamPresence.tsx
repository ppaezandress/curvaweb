"use client";

import { useEffect, useState, useCallback } from "react";
import { Music, Calendar, Clock } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

type Presence = {
  user_id: string;
  is_active: boolean;
  current_task: string | null;
  app_focus: string | null;
  track: string | null;
  artist: string | null;
  in_meeting: boolean | null;
  updated_at: string;
};
type Profile = { id: string; name: string; avatar_url: string | null };

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
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <h3 className="mb-3 text-xs font-semibold text-muted">Equipo</h3>
      <div className="space-y-3">
        {sorted.map((r) => {
          const prof = profiles[r.user_id];
          const online = onlineRecently(r.updated_at);
          return (
            <div key={r.user_id} className="flex items-start gap-2.5">
              <div className="relative">
                <Avatar name={prof?.name || "?"} src={prof?.avatar_url} size={36} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${r.in_meeting ? "bg-danger" : r.is_active ? "bg-success" : online ? "bg-warn" : "bg-muted"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{prof?.name || "—"}</p>
                <p className={`truncate text-xs ${r.in_meeting ? "font-medium text-danger" : "text-muted"}`}>
                  {r.in_meeting ? <span className="inline-flex items-center gap-1"><Calendar size={11} /> En junta</span>
                    : r.is_active ? (r.current_task ? <span className="inline-flex items-center gap-1"><Clock size={11} /> {r.current_task}</span> : "trabajando")
                    : online ? "en línea" : "desconectado"}
                </p>
                {r.track && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-spotify">
                    <Music size={11} className="shrink-0" /> {r.track}{r.artist ? ` · ${r.artist}` : ""}
                  </p>
                )}
                {r.app_focus && !r.track && (
                  <p className="mt-0.5 truncate text-xs text-muted">{r.app_focus}</p>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-muted">Nadie en línea aún.</p>}
      </div>
    </div>
  );
}
