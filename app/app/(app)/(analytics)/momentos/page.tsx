"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, ExternalLink, Music, Flame, Moon, Sunrise, Sun, CloudSun, Sunset, MoonStar, type LucideIcon } from "lucide-react";
import { useData } from "@/lib/data-context";
import { readMusicLog, type MusicEntry } from "@/lib/music-log";
import { hhmmFromISO } from "@/lib/format";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { notionTaskUrl } from "@/lib/notion-url";
import { KudosCard } from "@/components/KudosCard";
import { RachasBoard } from "@/components/RachasBoard";
import { AchievementsStrip } from "@/components/AchievementsStrip";
import { Meter } from "@/components/ui/Meter";

type TeamPhoto = { id: number; task_id: string; url: string; caption: string | null; user_id: string | null; created_at: string };

function timeOfDay(iso: string): LucideIcon {
  const h = new Date(iso).getHours();
  if (h < 5) return Moon;
  if (h < 8) return Sunrise;
  if (h < 12) return Sun;
  if (h < 18) return CloudSun;
  if (h < 21) return Sunset;
  return MoonStar;
}

// Momentos: la capa divertida del equipo (para TODOS). Fotos, buena onda, música.
// Cero horas ni métricas de cuánto trabaja nadie — eso es solo para admins.
export default function MomentosPage() {
  const { taskById } = useData();
  const [photos, setPhotos] = useState<TeamPhoto[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [music, setMusic] = useState<MusicEntry[]>([]);

  useEffect(() => {
    setMusic(readMusicLog());
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const [{ data: ph }, { data: profs }] = await Promise.all([
        sb.from("task_photos").select("id,task_id,url,caption,user_id,created_at").order("created_at", { ascending: false }).limit(60),
        sb.from("profiles").select("id,name"),
      ]);
      setPhotos((ph as TeamPhoto[]) || []);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: { id: string; name: string }) => (map[p.id] = p.name));
      setNames(map);
    })();
  }, []);

  const artistCount = useMemo(() => {
    const m = new Map<string, number>();
    music.forEach((e) => m.set(e.artist, (m.get(e.artist) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [music]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">Momentos</h1>
        <p className="mt-0.5 text-sm text-muted">Lo divertido del equipo: fotos, buena onda y música.</p>
      </div>

      {/* Buena onda */}
      <KudosCard />

      {/* Logros recientes (reacciones al cerrar tareas) */}
      <AchievementsStrip />

      {/* Rachas — para todos */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-fg"><Flame size={20} className="text-accent" /> Rachas</h2>
        <RachasBoard />
      </section>

      {/* Fotos del equipo */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg"><Camera size={20} /> Fotos del equipo</h2>
        <p className="mb-4 text-sm text-muted">Avances y momentos. Toca una para abrir la tarea en Notion.</p>
        {photos.length === 0 ? (
          <p className="rounded-control border border-dashed border-line py-8 text-center text-sm text-muted">Aún no hay fotos. Toma una desde cualquier tarea (ícono de cámara).</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => {
              const t = taskById[p.task_id];
              return (
                <a key={p.id} href={notionTaskUrl(p.task_id)} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-card border border-line transition hover:border-accent" title="Abrir en Notion">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || ""} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="flex items-center gap-1 truncate text-xs font-medium text-fg">
                      <ExternalLink size={11} className="shrink-0 text-accent" /> {t?.name || "Tarea"}
                    </p>
                    {p.caption && <p className="mt-0.5 truncate text-caption text-muted">{p.caption}</p>}
                    <p className="mt-1 flex items-center gap-1 text-caption text-muted">
                      {(() => { const TIcon = timeOfDay(p.created_at); return <TIcon size={12} className="shrink-0" />; })()}
                      {hhmmFromISO(p.created_at)}
                      {p.user_id && names[p.user_id] ? ` · ${names[p.user_id]}` : ""}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Música */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg"><Music size={20} /> Tu música mientras trabajas</h2>
        {artistCount.length === 0 ? (
          <p className="mt-3 rounded-control border border-dashed border-line py-8 text-center text-sm text-muted">Conecta Spotify en Ajustes para ver qué escuchas mientras trabajas.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {artistCount.map(([a, n]) => (
              <div key={a}>
                <div className="mb-0.5 flex items-center justify-between text-sm">
                  <span className="truncate text-fg">{a}</span>
                  <span className="tabular text-xs text-muted">{n}</span>
                </div>
                <Meter value={n} max={artistCount[0]?.[1] || 1} label={`${a}: ${n}`} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
