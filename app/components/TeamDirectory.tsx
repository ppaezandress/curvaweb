"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Music2, Loader2 } from "lucide-react";
import { computeStreak, dayKey, badgeFor } from "@/lib/streaks";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

type Profile = { id: string; name: string; avatar_url: string | null };
type MusicRow = { user_id: string; artist: string | null; track: string | null; at: string };
type Rec = { person: string; start: string };

// Directorio del equipo (para TODOS): la foto de cada quien, su racha y la música que
// ha escuchado. NADA de horas ni minutos — eso queda entre cada persona y los admins.
export function TeamDirectory() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [music, setMusic] = useState<MusicRow[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => {});
    if (!supabaseConfigured()) { setLoading(false); return; }
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    (async () => {
      const [{ data: profs }, { data: mus }] = await Promise.all([
        sb.from("profiles").select("id,name,avatar_url"),
        sb.from("music_log").select("user_id,artist,track,at").order("at", { ascending: false }).limit(400),
      ]);
      setProfiles((profs as Profile[]) || []);
      setMusic((mus as MusicRow[]) || []);
      setLoading(false);
    })();
  }, []);

  // Racha por persona (por nombre, como el resto del producto). Solo días, sin horas.
  const streakByName = useMemo(() => {
    const days = new Map<string, Set<string>>();
    records.forEach((r) => {
      if (!r.person || !r.start) return;
      if (!days.has(r.person)) days.set(r.person, new Set());
      days.get(r.person)!.add(dayKey(new Date(r.start).getTime()));
    });
    const out = new Map<string, number>();
    days.forEach((set, name) => out.set(name, computeStreak(set).current));
    return out;
  }, [records]);

  // Música por persona: artista top de lo reciente + última canción sonando.
  const musicByUser = useMemo(() => {
    const out = new Map<string, { top: string; last: string | null }>();
    const counts = new Map<string, Map<string, number>>();
    const last = new Map<string, string>();
    for (const m of music) {
      if (!m.user_id || !m.artist) continue;
      if (!counts.has(m.user_id)) counts.set(m.user_id, new Map());
      const c = counts.get(m.user_id)!;
      c.set(m.artist, (c.get(m.artist) || 0) + 1);
      if (!last.has(m.user_id)) last.set(m.user_id, m.track ? `${m.track} · ${m.artist}` : m.artist);
    }
    counts.forEach((c, uid) => {
      const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      out.set(uid, { top, last: last.get(uid) || null });
    });
    return out;
  }, [music]);

  const people = useMemo(
    () => [...profiles].sort((a, b) => (streakByName.get(b.name) || 0) - (streakByName.get(a.name) || 0) || a.name.localeCompare(b.name)),
    [profiles, streakByName],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface py-16 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Cargando al equipo…
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line py-12 text-center text-sm text-muted">
        Aún no hay perfiles del equipo. Aparecerán conforme cada quien entre y suba su foto.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => {
        const streak = streakByName.get(p.name) || 0;
        const badge = badgeFor(streak);
        const mus = musicByUser.get(p.id);
        return (
          <div key={p.id} className="flex flex-col items-center rounded-card border border-line bg-surface p-6 text-center shadow-soft transition hover:border-accent/40">
            <Avatar name={p.name} src={p.avatar_url} size={88} />
            <p className="mt-3 font-display text-lg font-bold text-fg">{p.name}</p>
            <div className="mt-2 flex items-center gap-1.5 rounded-chip bg-accent/10 px-3 py-1 text-caption font-semibold text-accent">
              <Flame size={13} /> {streak} {streak === 1 ? "día" : "días"} de racha
              {badge && <badge.icon size={13} className="ml-0.5" />}
            </div>
            <div className="mt-4 w-full border-t border-line pt-3">
              {mus?.top ? (
                <p className="flex items-center justify-center gap-1.5 text-caption text-muted">
                  <Music2 size={13} className="shrink-0 text-accent" />
                  <span className="truncate">{mus.last || mus.top}</span>
                </p>
              ) : (
                <p className="text-caption text-muted/70">Sin música registrada aún</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
