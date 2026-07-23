"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import { useGestureControl } from "@/lib/use-gesture-control";
import { unlockAudio, playForAction, playConfirmed } from "@/lib/gestures/sound";
import {
  computeThresholds, saveThresholds, clearCalibration, isCalibrated, type Sample,
} from "@/lib/gestures/calibration";
import { isSoundOn } from "@/lib/gesture-prefs";
import { GESTURE_EMOJI, GESTURE_LABEL, type Gesture } from "@/lib/gestures/vocabulary";

// Laboratorio del control por gestos (Fase 0). Existe para UNA decisión: ¿reconoce bien con
// TU cámara, TU luz y TU oficina? Aquí NO se toca el cronómetro — se puede probar todo el día
// sin ensuciar un solo registro de tiempo.
//
// Lo que hay que mirar antes de abrirlo al equipo:
//   · que cada gesto se reconozca al primer intento,
//   · cuántos disparos salen solos en diez minutos de trabajo normal (deberían ser cero),
//   · que los cuadros por segundo no se desplomen y la máquina no se caliente.
const ORDER: Gesture[] = ["uno", "dos", "tres", "palma", "dosPalmas"];

export default function LabGestosPage() {
  const [log, setLog] = useState<{ g: Gesture; at: string }[]>([]);
  const [fps, setFps] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<Gesture, number>>>({});
  // ── Calibración ──
  // Dos posturas medidas (mano abierta y puño) bastan para calcular los umbrales de ESTA
  // persona: el largo de sus dedos, su cámara y a qué distancia se sienta.
  const [calStep, setCalStep] = useState<"idle" | "abierta" | "puno" | "listo" | "fallo">("idle");
  const [calLeft, setCalLeft] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const openSamples = useRef<Sample[]>([]);
  const closedSamples = useRef<Sample[]>([]);
  const calStepRef = useRef<"idle" | "abierta" | "puno" | "listo" | "fallo">("idle");
  useEffect(() => { calStepRef.current = calStep; }, [calStep]);
  // Leer localStorage al montar y reflejarlo: es sincronizar con algo externo a React.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCalibrated(isCalibrated()); }, []);

  const onSample = useCallback((s: Sample) => {
    if (calStepRef.current === "abierta") openSamples.current.push(s);
    else if (calStepRef.current === "puno") closedSamples.current.push(s);
  }, []);

  const [stats, setStats] = useState({ frames: 0, agoSec: -1, source: "—" as string, hidden: false, received: 0, pumping: false, rawBroken: false, quality: 0, hint: null as string | null });

  const onCommand = useCallback((g: Gesture) => {
    // Aquí no se ejecuta ningún comando, pero suena IGUAL que en la app real: practicar sirve
    // para aprenderse los sonidos, no solo las señas.
    if (isSoundOn()) playForAction(g === "palma" ? "pause" : g === "dosPalmas" ? "resume" : "switch");
    setCounts((c) => ({ ...c, [g]: (c[g] || 0) + 1 }));
    setLog((l) => [{ g, at: new Date().toLocaleTimeString("es-MX") }, ...l].slice(0, 12));
  }, []);

  // Desestructurado a propósito: el linter de React trata cualquier acceso a un objeto que
  // contiene un ref como lectura de ref durante el render.
  const { status, error, candidate, progress, videoRef, start, stop, getStats } =
    useGestureControl({ enabled: true, onCommand, onSample: calStep === "abierta" || calStep === "puno" ? onSample : undefined });

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

  // Diagnóstico una vez por segundo: si te cambias a otra app y vuelves, aquí se ve si el
  // reconocimiento siguió trabajando (los cuadros suben) o si se congeló.
  useEffect(() => {
    if (status !== "running") return;
    const iv = setInterval(() => {
      const s = getStats();
      setStats({
        frames: s.frames,
        agoSec: s.lastFrameAt ? Math.max(0, Math.round((Date.now() - s.lastFrameAt) / 1000)) : -1,
        source: s.source,
        hidden: s.hidden,
        received: s.received,
        pumping: s.pumping,
        rawBroken: s.rawBroken,
        quality: s.quality,
        hint: s.hint,
      });
    }, 400);
    return () => clearInterval(iv);
  }, [status, getStats]);

  // Cuenta atrás de cada paso de la calibración.
  useEffect(() => {
    if (calStep !== "abierta" && calStep !== "puno") return;
    if (calLeft <= 0) {
      // Avance de la cuenta atrás: el estado es el reloj de la calibración.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (calStep === "abierta") { setCalStep("puno"); setCalLeft(4); return; }
      const t = computeThresholds(openSamples.current, closedSamples.current);
      if (t) {
        saveThresholds(t);
        setCalibrated(true);
        setCalStep("listo");
        playConfirmed();
      } else {
        setCalStep("fallo");
      }
      return;
    }
    const id = setTimeout(() => setCalLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [calStep, calLeft]);

  const startCalibration = () => {
    openSamples.current = [];
    closedSamples.current = [];
    setCalStep("abierta");
    setCalLeft(4);
  };

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
          onClick={running ? stop : () => { unlockAudio(); start(); }}
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
            <p className="text-caption font-semibold text-muted">Qué hace cada seña</p>
            <ul className="mt-2 space-y-1 text-caption text-muted">
              <li><b className="text-fg">1 a 3 dedos</b> · elige esa tarea del dock</li>
              <li><b className="text-fg">🖐️ palma</b> · pausa lo que corre</li>
              <li><b className="text-fg">🙌 las dos palmas</b> · sigue con lo último</li>
            </ul>
            <p className="mt-2 border-t border-line pt-2 text-caption text-muted">
              Cuenta cuántos dedos levantas, no cuáles. Sostén la seña un momento.
            </p>
            <p className="mt-2 flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2 text-caption">
              <span className="text-muted">Viendo ahora</span>
              <span className="font-medium text-fg">
                {candidate ? `${GESTURE_EMOJI[candidate]} ${GESTURE_LABEL[candidate]}` : running ? "nada claro" : "—"}
              </span>
            </p>
          </div>

          <div className="rounded-card border border-accent/30 bg-surface p-4 shadow-soft">
            <p className="text-caption font-semibold text-muted">Ajustar a tu mano</p>
            {calStep === "abierta" || calStep === "puno" ? (
              <>
                <p className="mt-1 text-sm font-semibold text-fg">
                  {calStep === "abierta" ? "Enseña la mano bien abierta" : "Ahora cierra el puño"}
                </p>
                <p className="text-caption text-muted">Sostenla frente a la cámara, como cuando das una orden.</p>
                <p className="tabular mt-2 font-display text-3xl font-bold text-accent">{calLeft}</p>
              </>
            ) : calStep === "listo" ? (
              <>
                <p className="mt-1 text-sm font-semibold text-success">Listo, quedó ajustado a tu mano.</p>
                <p className="text-caption text-muted">Prueba las señas: deberían entrar mucho mejor.</p>
                <button onClick={startCalibration} className="focus-ring mt-2 text-caption font-medium text-accent">
                  Volver a ajustar
                </button>
              </>
            ) : calStep === "fallo" ? (
              <>
                <p className="mt-1 text-sm font-semibold text-warn">No pude medir bien la diferencia.</p>
                <p className="text-caption text-muted">
                  Ponte de frente, con buena luz, y marca bien las dos posturas.
                </p>
                <button onClick={startCalibration} className="focus-ring mt-2 text-caption font-medium text-accent">
                  Intentar otra vez
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-caption text-muted">
                  Cada mano y cada cámara son distintas. Enseña dos posturas y el sistema aprende
                  <b className="text-fg"> tus</b> medidas — es lo que arregla el “a veces no me lee”.
                </p>
                <button
                  onClick={startCalibration}
                  disabled={!running}
                  className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {calibrated ? "Volver a ajustar" : "Ajustar a mi mano"}
                </button>
                {!running && <p className="mt-1 text-caption text-muted">Enciende la cámara primero.</p>}
                {calibrated && (
                  <button
                    onClick={() => { clearCalibration(); setCalibrated(false); }}
                    className="focus-ring ml-3 text-caption text-muted hover:text-fg"
                  >
                    Borrar ajuste
                  </button>
                )}
              </>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <p className="text-caption font-semibold text-muted">Qué tan clara te ve</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width,background-color] duration-200"
                style={{
                  width: `${Math.round(stats.quality * 100)}%`,
                  background: stats.quality >= 0.8 ? "var(--success)" : stats.quality >= 0.35 ? "var(--accent)" : "var(--warn)",
                }}
              />
            </div>
            <p className="mt-1.5 text-caption text-muted">
              {!running ? "Enciende la cámara para medir."
                : stats.quality === 0 ? "No veo ninguna mano."
                : stats.hint ? <><b className="text-fg">{stats.hint}</b> — así entra más rápido.</>
                : "Perfecto: así se confirma en el tiempo mínimo."}
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
                <dt className="text-muted">Cuadros de cámara</dt>
                <dd className="font-mono text-fg">{stats.received}{stats.rawBroken ? " (rechazados)" : ""}</dd>
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
