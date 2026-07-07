"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

// Reproductor de video propio (tipo nota de video de Telegram/Instagram) — reemplaza
// el <video controls> nativo. Cuadrado redondeado, play grande al centro en reposo,
// barra de progreso propia, mute y pantalla completa. Tap sobre el video = play/pausa.
export function VideoBubble({ src, mine }: { src: string; mine: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCur(v.currentTime);
    const onMeta = () => setDur(Number.isFinite(v.duration) ? v.duration : 0);
    const onEnd = () => { setPlaying(false); setCur(0); v.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("ended", onEnd);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("ended", onEnd);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const fullscreen = () => { void videoRef.current?.requestFullscreen?.(); };
  const seek = (e: React.MouseEvent) => {
    const v = videoRef.current, track = trackRef.current;
    if (!v || !track || !Number.isFinite(dur) || dur <= 0) return;
    const r = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    v.currentTime = pct * dur;
    setCur(pct * dur);
  };

  const progress = Number.isFinite(dur) && dur > 0 ? cur / dur : 0;

  return (
    <div className={cn("group/vid relative w-60 max-w-[78vw] overflow-hidden rounded-hero bg-ink shadow-soft", mine && "ring-1 ring-accent/30")}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        onClick={toggle}
        className="aspect-square w-full cursor-pointer object-cover"
      />

      {/* Botón grande de play cuando está pausado */}
      {!playing && (
        <button onClick={toggle} className="absolute inset-0 flex items-center justify-center bg-ink/20 transition" aria-label="Reproducir video">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink shadow-float transition active:scale-90">
            <Play size={24} fill="currentColor" className="ml-1" />
          </span>
        </button>
      )}

      {/* Barra de controles inferior (siempre legible sobre el degradado) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 via-ink/30 to-transparent px-3 pb-2.5 pt-8">
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={toggle} className="shrink-0 text-white transition hover:text-white/80 focus-ring active:scale-90" aria-label={playing ? "Pausar" : "Reproducir"}>
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="tabular shrink-0 text-[11px] font-semibold text-white">{fmt(cur)} / {fmt(dur)}</span>
          <div ref={trackRef} onClick={seek} className="group/bar flex h-4 flex-1 cursor-pointer items-center" role="slider" aria-label="Progreso del video" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
          <button onClick={toggleMute} className="shrink-0 text-white transition hover:text-white/80 focus-ring active:scale-90" aria-label={muted ? "Activar sonido" : "Silenciar"}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button onClick={fullscreen} className="shrink-0 text-white transition hover:text-white/80 focus-ring active:scale-90" aria-label="Pantalla completa">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
