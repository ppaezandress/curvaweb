"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, CheckCircle2, Clock, Flame, Music } from "lucide-react";
import { useData } from "@/lib/data-context";
import { useApp } from "@/lib/app-context";
import { listReactions, type Reaction } from "@/lib/reactions";
import { readMusicLog, type MusicEntry } from "@/lib/music-log";
import { formatHours, hhmmFromISO } from "@/lib/format";
import { isDone } from "@/lib/task-status";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { notionTaskUrl } from "@/lib/notion-url";
import { KudosCard } from "@/components/KudosCard";
import { Camera, ExternalLink } from "lucide-react";

type TeamPhoto = { id: number; task_id: string; url: string; caption: string | null; user_id: string | null; created_at: string };

type Rec = { id: string; taskId: string; person: string; start: string; minutes: number };

function monthLabel(d: Date) {
  const s = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Emoji según el momento del día en que se subió la foto.
function timeOfDay(iso: string): { emoji: string; label: string } {
  const h = new Date(iso).getHours();
  if (h < 5) return { emoji: "🌙", label: "madrugada" };
  if (h < 8) return { emoji: "🌅", label: "amanecer" };
  if (h < 12) return { emoji: "☀️", label: "mañana" };
  if (h < 18) return { emoji: "🌤️", label: "tarde" };
  if (h < 21) return { emoji: "🌆", label: "atardecer" };
  return { emoji: "🦉", label: "noche" };
}

export default function RecapPage() {
  const { tasks, taskById, memberById } = useData();
  const { currentUserId, isAdmin } = useApp();
  const myName = ((currentUserId ? memberById[currentUserId]?.name : "") || "").trim().toLowerCase();
  const [records, setRecords] = useState<Rec[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [music, setMusic] = useState<MusicEntry[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  useEffect(() => {
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
    listReactions().then(setReactions);
    setMusic(readMusicLog());
  }, []);

  const monthEnd = useMemo(() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); return d; }, [month]);
  const inMonth = (ms: number) => ms >= month.getTime() && ms < monthEnd.getTime();

  // Muro: un no-admin ve SOLO sus propias horas (su recap). Admin ve todo.
  const scopedRecords = isAdmin ? records : records.filter((r) => (r.person || "").trim().toLowerCase() === myName);
  const recsM = scopedRecords.filter((r) => r.start && inMonth(new Date(r.start).getTime()));
  const reactsM = reactions.filter((r) => inMonth(r.at));
  const musicM = music.filter((m) => inMonth(m.at));

  const totalMin = recsM.reduce((a, r) => a + r.minutes, 0);
  const doneCount = tasks.filter((t) => isDone(t.status)).length;

  // Música: género top + tareas×género
  const genreCount = useMemo(() => {
    const m = new Map<string, number>();
    musicM.forEach((e) => e.genres?.forEach((g) => m.set(g, (m.get(g) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [musicM]);
  const artistCount = useMemo(() => {
    const m = new Map<string, number>();
    musicM.forEach((e) => m.set(e.artist, (m.get(e.artist) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [musicM]);

  const photoURLs = useMemo(
    () => reactsM.map((r) => ({ r, url: r.photo ? URL.createObjectURL(r.photo) : null })),
    [reactsM],
  );
  useEffect(() => () => photoURLs.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [photoURLs]);

  // Fotos de tareas del equipo (compartidas) — click → abre la tarea en Notion.
  const [teamPhotos, setTeamPhotos] = useState<TeamPhoto[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const [{ data: ph }, { data: profs }] = await Promise.all([
        sb.from("task_photos").select("id,task_id,url,caption,user_id,created_at").order("created_at", { ascending: false }).limit(60),
        sb.from("profiles").select("id,name"),
      ]);
      setTeamPhotos((ph as TeamPhoto[]) || []);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: { id: string; name: string }) => (map[p.id] = p.name));
      setProfileNames(map);
    })();
  }, []);
  const photosM = teamPhotos.filter((p) => inMonth(new Date(p.created_at).getTime()));

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">Recap</h1>
          <p className="mt-0.5 text-sm text-muted">Tu mes en tiempo, logros y música.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-1 shadow-soft">
          <button onClick={() => setMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })} className="rounded-full p-1.5 text-muted hover:bg-surface-2"><ChevronLeft size={16} /></button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-fg">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })} className="rounded-full p-1.5 text-muted hover:bg-surface-2"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi icon={<Clock size={18} />} label="Tiempo medido" value={formatHours(totalMin * 60)} />
        <Kpi icon={<CheckCircle2 size={18} />} label="Tareas Done" value={String(doneCount)} />
        <Kpi icon={<Sparkles size={18} />} label="Reacciones" value={String(reactsM.length)} />
      </div>

      {/* Kudos de cultura: compañeros con quienes trabajaste + buena onda recibida */}
      <KudosCard />

      {/* Muro de reacciones */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg"><Flame size={20} /> Muro de logros</h2>
        <p className="mb-4 text-sm text-muted">Cómo se sintió cerrar cada tarea.</p>
        {reactsM.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">Aún no hay reacciones este mes. Marca una tarea como Done para empezar tu muro. 🎉</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photoURLs.map(({ r, url }) => (
              <div key={r.id} className="overflow-hidden rounded-2xl border border-line">
                {url ? (
                  <img src={url} alt="reacción" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-surface-2 text-4xl">{r.emoji}</div>
                )}
                <div className="flex items-center gap-1.5 p-2">
                  <span className="text-lg">{r.emoji}</span>
                  <span className="truncate text-xs text-muted">{r.taskName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fotos de tareas del equipo — click abre la tarea en Notion */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg"><Camera size={20} /> Fotos del equipo</h2>
        <p className="mb-4 text-sm text-muted">Avances y evidencia de las tareas. Toca una para abrirla en Notion.</p>
        {photosM.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">Aún no hay fotos este mes. Toma una desde cualquier tarea (ícono de cámara). 📸</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photosM.map((p) => {
              const t = taskById[p.task_id];
              return (
                <a key={p.id} href={notionTaskUrl(p.task_id)} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl border border-line transition hover:border-accent" title="Abrir en Notion">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || ""} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="flex items-center gap-1 truncate text-xs font-medium text-fg">
                      <ExternalLink size={11} className="shrink-0 text-accent" /> {t?.name || "Tarea"}
                    </p>
                    {p.caption && <p className="mt-0.5 truncate text-[11px] text-muted">{p.caption}</p>}
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted" title={timeOfDay(p.created_at).label}>
                      <span className="text-xs">{timeOfDay(p.created_at).emoji}</span>
                      {hhmmFromISO(p.created_at)}
                      {p.user_id && profileNames[p.user_id] ? ` · ${profileNames[p.user_id]}` : ""}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Música */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg"><Music size={20} /> Tu mes en música</h2>
        {musicM.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">Conecta Spotify en Ajustes para ver qué escuchaste mientras trabajabas. 🎧</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">{musicM.length} canciones registradas mientras trabajabas.</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-muted">Géneros top</p>
                {genreCount.map(([g, n]) => (
                  <div key={g} className="mb-2">
                    <div className="mb-0.5 flex items-center justify-between text-sm">
                      <span className="capitalize text-fg">{g}</span>
                      <span className="tabular text-xs text-muted">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-spotify" style={{ width: `${(n / (genreCount[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-muted">Artistas top</p>
                {artistCount.map(([a, n]) => (
                  <div key={a} className="mb-2">
                    <div className="mb-0.5 flex items-center justify-between text-sm">
                      <span className="truncate text-fg">{a}</span>
                      <span className="tabular text-xs text-muted">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="curva-gradient h-full rounded-full" style={{ width: `${(n / (artistCount[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">{icon}{label}</p>
      <p className="tabular mt-1 font-display text-2xl font-bold text-fg">{value}</p>
    </div>
  );
}
