"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/cn";

// Reproductor de audio propio (tipo WhatsApp) — reemplaza el <audio controls> nativo,
// que se ve distinto y feo en cada navegador. Play/pausa, waveform que se llena con el
// progreso (seek al tocar) y duración. El waveform es decorativo pero estable por audio.
const BARS = 34;

// Alturas pseudo-aleatorias pero DETERMINISTAS por URL (mismo audio → mismo dibujo).
function barHeights(seed: string): number[] {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push(0.28 + (x % 100) / 100 * 0.72); // 0.28–1.0
  }
  return out;
}

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

export function VoiceBubble({ src, mine }: { src: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const barsRef = useRef<number[] | null>(null);
  if (barsRef.current === null) barsRef.current = barHeights(src);
  const bars = barsRef.current;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => {
      // webm de MediaRecorder a veces reporta duration=Infinity hasta que "recorres"
      // el audio. Truco conocido: saltar al final fuerza el cálculo real.
      if (!Number.isFinite(a.duration)) {
        a.currentTime = 1e101;
        a.addEventListener("timeupdate", function once() { a.currentTime = 0; setDur(a.duration || 0); a.removeEventListener("timeupdate", once); }, { once: true });
      } else {
        setDur(a.duration || 0);
      }
    };
    const onEnd = () => { setPlaying(false); setCur(0); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onPause);
    a.addEventListener("play", onPlay);
    // Si los metadatos ya cargaron antes de montar el listener (archivos locales/caché
    // disparan loadedmetadata muy rápido), leemos la duración de una vez.
    if (a.readyState >= 1) onMeta();
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("play", onPlay);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  };

  const seek = (e: React.MouseEvent) => {
    const a = audioRef.current;
    const track = trackRef.current;
    if (!a || !track || !Number.isFinite(dur) || dur <= 0) return;
    const r = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    a.currentTime = pct * dur;
    setCur(pct * dur);
  };

  const progress = Number.isFinite(dur) && dur > 0 ? cur / dur : 0;
  const label = playing || cur > 0 ? cur : dur; // duración en reposo, transcurrido al reproducir

  return (
    <div className={cn("flex w-56 max-w-[72vw] items-center gap-3 rounded-hero px-3 py-2.5", mine ? "bg-accent text-white" : "bg-surface text-fg shadow-soft")}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        aria-label={playing ? "Pausar audio" : "Reproducir audio"}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition focus-ring active:scale-90",
          mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-accent text-white hover:opacity-90",
        )}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div ref={trackRef} onClick={seek} className="flex h-7 cursor-pointer items-center gap-[2px]" role="slider" aria-label="Progreso del audio" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          {bars.map((h, i) => {
            const active = progress > 0 && i / BARS <= progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-full rounded-full transition-colors",
                  mine ? (active ? "bg-white" : "bg-white/35") : (active ? "bg-accent" : "bg-accent/25"),
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>
        <div className={cn("mt-0.5 tabular text-[11px]", mine ? "text-white/80" : "text-muted")}>{fmt(label)}</div>
      </div>
    </div>
  );
}
