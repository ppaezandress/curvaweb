"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import { useGestureControl } from "@/lib/use-gesture-control";
import { unlockAudio, playForAction } from "@/lib/gestures/sound";
import { isSoundOn, markOnboarded } from "@/lib/gesture-prefs";
import { GESTURE_EMOJI, GESTURE_LABEL, type Gesture } from "@/lib/gestures/recognizer";

// Laboratorio del control por gestos. Existe para UNA decisión honesta: ¿el modelo entrenado
// reconoce bien con TU cámara, TU luz y TU oficina? Aquí NO se toca el cronómetro.
//
// La pieza clave es el panel "Lo que ve el modelo": muestra la categoría CRUDA que devuelve
// MediaPipe y su confianza. Si haces la palma y dice "Open_Palm 0.95", funciona. Si dice
// "None 0.3", ni el modelo entrenado la clava en esta cámara — y esa es la señal para archivar
// en vez de seguir tocando código a ciegas.
const ORDER: Gesture[] = ["uno", "dos", "tres", "palma", "pulgar"];

export default function LabGestosPage() {
  const [log, setLog] = useState<{ g: Gesture; at: string }[]>([]);
  const [fps, setFps] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<Gesture, number>>>({});
  const [stats, setStats] = useState({
    frames: 0, agoSec: -1, source: "—" as string, received: 0, rawBroken: false,
    quality: 0, read: null as string | null, raw: null as string | null,
  });

  const onCommand = useCallback((g: Gesture) => {
    // Aquí no se ejecuta ningún comando, pero suena IGUAL que en la app real: practicar sirve
    // para aprenderse los sonidos, no solo las señas.
    if (isSoundOn()) playForAction(g === "palma" ? "pause" : g === "pulgar" ? "resume" : "switch");
    setCounts((c) => ({ ...c, [g]: (c[g] || 0) + 1 }));
    setLog((l) => [{ g, at: new Date().toLocaleTimeString("es-MX") }, ...l].slice(0, 12));
  }, []);

  const { status, error, candidate, progress, videoRef, start, stop, getStats } =
    useGestureControl({ enabled: true, onCommand });

  // Cuadros por segundo reales del <video>: para ver si la cámara se está ahogando.
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

  // Diagnóstico: la salida cruda del modelo + si el reconocimiento sigue vivo en segundo plano.
  useEffect(() => {
    if (status !== "running") return;
    const iv = setInterval(() => {
      const s = getStats();
      setStats({
        frames: s.frames,
        agoSec: s.lastFrameAt ? Math.max(0, Math.round((Date.now() - s.lastFrameAt) / 1000)) : -1,
        source: s.source,
        received: s.received,
        rawBroken: s.rawBroken,
        quality: s.quality,
        read: s.read,
        raw: s.raw,
      });
    }, 300);
    return () => clearInterval(iv);
  }, [status, getStats]);

  const running = status === "running";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/ajustes" className="mb-2 inline-flex items-center gap-1.5 text-caption text-muted transition hover:text-fg">
            <ArrowLeft size={13} /> Ajustes
          </Link>
          <h1 className="font-display text-2xl font-bold text-fg">Practicar los gestos</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Agárrale el modo con tu cámara y tu luz. Aquí <b>no se mide tiempo</b>: nada de lo que
            hagas toca tus tareas ni tu historial, así que prueba lo que quieras.
          </p>
        </div>
        <button
          onClick={running ? stop : () => { unlockAudio(); markOnboarded(); start(); }}
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
        {/* Lo que ve la cámara */}
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
            <p className="text-caption font-semibold text-muted">Qué hace cada seña</p>
            <ul className="mt-2 space-y-1 text-caption text-muted">
              <li><b className="text-fg">☝️ índice</b> · tarea 1 · <b className="text-fg">✌️ dos</b> · tarea 2 · <b className="text-fg">3️⃣ tres dedos</b> · tarea 3</li>
              <li><b className="text-fg">🖐️ palma</b> · pausa lo que corre</li>
              <li><b className="text-fg">👍 pulgar</b> · sigue con lo último</li>
            </ul>
            <p className="mt-2 border-t border-line pt-2 text-caption text-muted">
              Sostén la seña un momento, de frente a la cámara.
            </p>
          </div>

          {/* La pieza clave: la salida CRUDA del modelo. Es el veredicto go/no-go. */}
          <div className="rounded-card border border-accent/30 bg-surface p-4 shadow-soft">
            <p className="text-caption font-semibold text-muted">Lo que ve el modelo</p>
            <p className="mt-1 text-caption text-muted">
              La categoría exacta que reconoce Google y su confianza. Haz una seña y míralo en vivo.
            </p>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-lg font-bold text-fg">{running ? (stats.raw ?? "—") : "—"}</span>
              <span className="tabular font-mono text-sm text-muted">{running ? stats.quality.toFixed(2) : "—"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width,background-color] duration-150"
                style={{
                  width: `${Math.round(stats.quality * 100)}%`,
                  background: stats.quality >= 0.7 ? "var(--success)" : stats.quality >= 0.4 ? "var(--warn)" : "var(--danger)",
                }}
              />
            </div>
            <p className="mt-1.5 text-caption text-muted">
              {!running ? "Enciende la cámara para ver."
                : !stats.raw || stats.raw === "None" ? "No reconozco ninguna seña. Muestra la mano de frente."
                : stats.read ? <><b className="text-fg">Entra como {GESTURE_LABEL[stats.read as Gesture]}.</b> Sostenla para ejecutar.</>
                : "El modelo ve un gesto, pero no es uno de los nuestros."}
            </p>
          </div>

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
            <p className="text-caption font-semibold text-muted">¿Sigue trabajando?</p>
            <p className="mt-1 text-caption text-muted">
              Cámbiate a otra app, haz una seña y vuelve: si los cuadros subieron, siguió viéndote.
            </p>
            <dl className="mt-2 space-y-1 text-caption">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Cuadros analizados</dt>
                <dd className="font-mono text-fg">{stats.frames}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Última imagen</dt>
                <dd className="font-mono text-fg">{stats.agoSec >= 0 ? `hace ${stats.agoSec}s` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Origen</dt>
                <dd className="font-mono text-fg">
                  {stats.source === "track" ? "cámara directa" : stats.source === "video" ? "video (solo visible)" : "—"}
                </dd>
              </div>
            </dl>
            {stats.source === "video" && running && (
              <p className="mt-2 rounded-control border border-warn/40 bg-warn/10 px-2.5 py-2 text-caption text-fg">
                Tu navegador no deja leer la cámara directamente, así que al cambiarte de app el
                reconocimiento se pausa. En Chrome sí funciona.
              </p>
            )}
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
