"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Trophy, Crown, Shield, Loader2, Users, Lock } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { computeStreak, dayKey, badgeFor, STREAK_BADGES } from "@/lib/streaks";
import { Avatar } from "@/components/Avatar";

type Rec = { person: string; start: string; minutes: number };

// Tablero de rachas (para TODOS). Días seguidos midiendo tiempo, racha de equipo,
// tabla de líderes y medallas. Reutilizable: vive dentro de Momentos.
export function RachasBoard() {
  const { currentUserId } = useApp();
  const { members, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const board = useMemo(() => {
    const byPerson = new Map<string, Set<string>>();
    records.forEach((r) => {
      if (!r.start || !r.person) return;
      if (!byPerson.has(r.person)) byPerson.set(r.person, new Set());
      byPerson.get(r.person)!.add(dayKey(new Date(r.start).getTime()));
    });
    return [...byPerson.entries()]
      .map(([person, days]) => {
        const s = computeStreak(days);
        const member = members.find((m) => m.name === person);
        return { person, member, ...s };
      })
      .sort((a, b) => b.current - a.current || b.longest - a.longest);
  }, [records, members]);

  const mine = board.find((b) => me && b.person === me.name);

  const teamStreak = useMemo(() => {
    const everyoneDays = new Map<string, Set<string>>();
    board.forEach((b) => {
      const days = new Set<string>();
      records.forEach((r) => { if (r.person === b.person && r.start) days.add(dayKey(new Date(r.start).getTime())); });
      everyoneDays.set(b.person, days);
    });
    if (everyoneDays.size === 0) return 0;
    const sets = [...everyoneDays.values()];
    const inter = new Set([...sets[0]].filter((d) => sets.every((s) => s.has(d))));
    return computeStreak(inter).current;
  }, [board, records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface py-16 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Calculando rachas…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tu racha */}
      <section className="curva-gradient overflow-hidden rounded-hero p-6 text-white shadow-float sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/80"><Flame size={16} /> Tu racha actual</p>
            <p className="tabular mt-2 font-display text-6xl font-bold leading-none">{mine?.current ?? 0}<span className="ml-2 text-2xl font-semibold text-white/70">días</span></p>
            <p className="mt-3 text-sm text-white/70">
              Récord histórico: {mine?.longest ?? 0} días{mine && mine.shieldsUsed > 0 ? ` · ${mine.shieldsUsed} escudo(s) usados` : ""}
            </p>
          </div>
          {mine && badgeFor(mine.current) && (() => {
            const M = badgeFor(mine.current)!;
            const Icon = M.icon;
            return (
              <div className="text-center">
                <Icon size={44} strokeWidth={1.5} className="mx-auto" />
                <p className="mt-1 text-xs text-white/80">{M.label}</p>
              </div>
            );
          })()}
        </div>
        {mine && (() => {
          const next = STREAK_BADGES.find((b) => b.days > mine.current);
          if (!next) return null;
          const prev = [...STREAK_BADGES].reverse().find((b) => b.days <= mine.current)?.days ?? 0;
          const pct = ((mine.current - prev) / (next.days - prev)) * 100;
          return (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-white/70">
                <span className="flex items-center gap-1">Siguiente: <next.icon size={13} /> {next.label}</span>
                <span>{mine.current}/{next.days} días</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface/20">
                <div className="h-full rounded-full bg-surface" style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          );
        })()}
      </section>

      {/* Racha de equipo */}
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-success/10 text-success"><Users size={22} /></span>
        <div>
          <p className="text-xs text-muted">Racha de equipo</p>
          <p className="tabular font-display text-2xl font-bold text-fg">{teamStreak} días</p>
        </div>
        <p className="ml-auto max-w-[40%] text-right text-xs text-muted">Días seguidos donde todo el equipo registró tiempo.</p>
      </section>

      {/* Leaderboard */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-fg"><Trophy size={18} className="text-warn" /> Tabla de líderes</h3>
        <div className="space-y-1.5">
          {board.map((b, i) => {
            const badge = badgeFor(b.current);
            const isMe = me && b.person === me.name;
            return (
              <div key={b.person} className={`flex items-center gap-3 rounded-control px-3 py-2.5 ${isMe ? "bg-accent/5 ring-1 ring-accent/30" : i % 2 ? "bg-surface-2/60" : ""}`}>
                <span className={`w-6 text-center font-display text-sm font-bold ${i === 0 ? "text-warn" : "text-muted"}`}>
                  {i === 0 ? <Crown size={16} className="mx-auto" /> : i + 1}
                </span>
                {b.member ? <Avatar member={b.member} size={32} /> : <span className="h-8 w-8 rounded-full bg-surface-2" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{b.person}{isMe ? " (tú)" : ""}</p>
                  <p className="text-xs text-muted">Récord {b.longest}d · {b.activeDays} días activos</p>
                </div>
                {badge && <span title={badge.label} className="text-accent"><badge.icon size={16} /></span>}
                <span className="tabular flex items-center gap-1 font-display text-lg font-bold text-fg">
                  <Flame size={15} className="text-accent" /> {b.current}
                </span>
              </div>
            );
          })}
          {board.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Aún no hay rachas. Empieza a medir tu tiempo.</p>
          )}
        </div>
      </section>

      {/* Medallas */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <h3 className="mb-4 font-display text-lg font-bold text-fg">Medallas</h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {STREAK_BADGES.map((bdg) => {
            const got = (mine?.current ?? 0) >= bdg.days || (mine?.longest ?? 0) >= bdg.days;
            return (
              <div key={bdg.days} className={`rounded-card border p-3 text-center ${got ? "border-accent/30 bg-accent/5" : "border-line opacity-50"}`}>
                <div className="flex justify-center">{got ? <bdg.icon size={26} strokeWidth={1.5} className="text-accent" /> : <Lock size={22} className="text-muted" />}</div>
                <p className="mt-1 text-xs font-semibold text-fg">{bdg.label}</p>
                <p className="text-caption text-muted">{bdg.days} días</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Shield size={13} /> Los escudos evitan que faltar un día rompa tu racha (2 al mes).</p>
      </section>
    </div>
  );
}
