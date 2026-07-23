"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useGestureControl } from "@/lib/use-gesture-control";
import { GESTURE_EMOJI, GESTURE_LABEL, type Gesture } from "@/lib/gestures/vocabulary";

// Laboratorio del control por gestos (Fase 0). Existe para UNA decisión: ¿reconoce bien con
// TU cámara, TU luz y TU oficina? Aquí NO se toca el cronómetro — se puede probar todo el día
// sin ensuciar un solo registro de tiempo.
//
// Lo que hay que mirar antes de abrirlo al equipo:
//   · que cada gesto se reconozca al primer intento,
//   · cuántos disparos salen solos en diez minutos de trabajo normal (deberían ser cero),
//   · que los cuadros por segundo no se desplomen y la máquina no se caliente.
const ORDER: Gesture[] = ["uno", "dos", "tres", "cuatro", "palma", "puno"];

export default function LabGestosPage() {
  const { isAdmin, adminResolved } = useApp();
  const [log, setLog] = useState<{ g: Gesture; at: string }[]>([]);
  const [fps, setFps] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<Gesture, number>>>({});

  const onCommand = useCallback((g: Gesture) => {
    setCounts((c) => ({ ...c, [g]: (c[g] || 0) + 1 }));
    setLog((l) => [{ g, at: new Date().toLocaleTimeString("es-MX") }, ...l].slice(0, 12));
  }, []);

  // Desestructurado a propósito: el linter de React trata cualquier acceso a un objeto que
  // contiene un ref como lectura de ref durante el render.
  const { status, error, candidate, progress, videoRef, start, stop } =
    useGestureControl({ enabled: true, onCommand });

  // Cuadros por segundo reales del <video> (no de la inferencia): sirve para ver si la cámara
  // se está ahogando.
  useEffect(() => {
    if (status !== "running") return;
    const v = videoRef.current;
    if (!v || typeof v.requestVideoFrameCallback !== "function") return;
    let frames = 0, id = 0, alive = true;
    const tick = () => { frames++; if (alive) id = v.requestVideoFrameCallback(tick); };
    id = v.requestVideoFrameCallback(tick);
    const iv = setInterval(() => { setFps(frames); frames = 0; }, 1000);
    return () => { alive = false; v.cancelVideoFrameCallback?.(id); clearInterval(iv); };
  }, [status, videoRef]);

  if (adminResolved && !isAdmin) {
    return <p className="text-sm text-muted">Esta página es del laboratorio interno.</p>;
  }

  const running = status === "running";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/ajustes" className="mb-2 inline-flex items-center gap-1.5 text-caption text-muted transition hover:text-fg">
            <ArrowLeft size={13} /> Ajustes
          </Link>
          <h1 className="font-display text-2xl font-bold text-fg">Laboratorio · gestos</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Prueba el reconocimiento con tu cámara y tu luz. Aquí <b>no se mide tiempo</b>: nada de
            lo que hagas toca tus tareas ni tu historial.
          </p>
        </div>
        <button
          onClick={running ? stop : start}
          className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            running ? "border border-line bg-surface text-fg hover:border-danger/40 hover:text-danger" : "bg-accent text-white hover:opacity-90"
          }`}
        >
          {running ? <><CameraOff size={15} /> Apagar</> : <><Camera size={15} /> Encender cámara</>}
        </button>
      </div>

      {error && (
        <p className="rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Lo que ve la cámara, en grande — solo en el laboratorio */}
        <div className="overflow-hidden rounded-card border border-line bg-ink shadow-soft">
          <div className="relative aspect-video">
            <video
              ref={videoRef}
              muted
              playsInline
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            />
            {!running && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                La cámara está apagada.
              </div>
            )}
            {running && candidate && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
                <span aria-hidden className="text-3xl leading-none">{GESTURE_EMOJI[candidate]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{GESTURE_LABEL[candidate]}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <p className="text-caption font-semibold text-muted">Aciertos por gesto</p>
            <ul className="mt-2 space-y-1.5">
              {ORDER.map((g) => (
                <li key={g} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-fg">
                    <span aria-hidden>{GESTURE_EMOJI[g]}</span> {GESTURE_LABEL[g]}
                  </span>
                  <span className="font-mono text-muted">{counts[g] || 0}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2 text-caption text-muted">
              Cuadros por segundo: <span className="font-mono text-fg">{running ? fps : "—"}</span>
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <p className="text-caption font-semibold text-muted">Últimos disparos</p>
            {log.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nada todavía. Sostén un gesto un segundo.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-fg">{GESTURE_EMOJI[l.g]} {GESTURE_LABEL[l.g]}</span>
                    <span className="font-mono text-caption text-muted">{l.at}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
