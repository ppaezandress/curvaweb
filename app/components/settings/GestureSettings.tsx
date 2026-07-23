"use client";

import { useEffect, useState } from "react";
import { Hand, ShieldCheck, Volume2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { PILOT } from "@/lib/pilot-flags";
import { GESTURE_ENABLED_EVENT, isGestureOptIn, setGestureOptIn } from "@/lib/gesture-prefs";
import { isSoundOn, setSoundOn, playConfirmed } from "@/lib/gestures/sound";
import { GESTURE_EMOJI, GESTURE_LABEL, type Gesture } from "@/lib/gestures/vocabulary";

// Ajustes del control por gestos. La promesa del producto es "esto es para ti, no para
// vigilarte", así que aquí se dice sin rodeos qué hace la cámara y qué no — y se apaga en el
// mismo lugar donde se prende.

const VOCABULARY: { gesture: Gesture; does: string }[] = [
  { gesture: "uno", does: "Mide la 1ª tarea del dock" },
  { gesture: "dos", does: "Cambia a la 2ª" },
  { gesture: "tres", does: "Cambia a la 3ª" },
  { gesture: "cuatro", does: "Cambia a la 4ª" },
  { gesture: "palma", does: "Pausa lo que esté corriendo" },
  { gesture: "puno", does: "Sigue con lo último que medías" },
];

export function GestureSettings() {
  const [on, setOn] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    const read = () => { setOn(isGestureOptIn()); setSound(isSoundOn()); };
    read();
    window.addEventListener(GESTURE_ENABLED_EVENT, read);
    return () => window.removeEventListener(GESTURE_ENABLED_EVENT, read);
  }, []);

  if (!PILOT.gestures) return null;

  return (
    <div>
      <h3 className="flex items-center gap-2 font-display font-bold text-fg">
        <Hand size={16} className="text-accent" /> Control por gestos
      </h3>
      <p className="mb-3 mt-0.5 text-sm text-muted">
        Cambia de tarea o pausa el cronómetro con la mano, sin tocar el teclado. Para cuando estás
        en llamada, escribiendo a mano o lejos de la compu.
      </p>

      <div className="rounded-card border border-line bg-surface shadow-soft">
        <Toggle
          icon={<Hand size={16} />}
          label="Activar el control por gestos"
          hint="Enciende la cámara solo mientras lo uses. Se apaga sola si dejas de hacer gestos."
          on={on}
          onChange={setGestureOptIn}
        />

        {on && (
          <div className="border-t border-line">
            <Toggle
              icon={<Volume2 size={16} />}
              label="Avisarme con un sonido"
              hint="Un tic al reconocer tu mano y un tono al ejecutar. Así sabes que la cámara te está viendo."
              on={sound}
              onChange={(v) => { setSoundOn(v); setSound(v); if (v) playConfirmed(); }}
            />
          </div>
        )}

        {on && (
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-caption font-semibold text-muted">Los gestos</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {VOCABULARY.map(({ gesture, does }) => (
                <li key={gesture} className="flex items-center gap-2.5 rounded-control bg-surface-2 px-3 py-2">
                  <span aria-hidden className="text-lg leading-none">{GESTURE_EMOJI[gesture]}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{GESTURE_LABEL[gesture]}</span>
                    <span className="block text-caption text-muted">{does}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-caption text-muted">
              Cuenta <b>cuántos dedos</b> levantas, no cuáles: da igual si el 3 lo haces con el
              pulgar o sin él. Hay que <b>sostener</b> la seña un segundo para que cuente — así
              un saludo en una junta no te mueve el cronómetro — y todo se puede deshacer.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-card border border-success/30 bg-success/5 p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
        <div className="text-sm">
          <p className="font-semibold text-fg">La cámara no sale de tu computadora.</p>
          <p className="mt-0.5 text-muted">
            El video se procesa <b>aquí</b>, en tu navegador: no se graba, no se guarda y no se
            envía a ningún servidor — ni al nuestro. Esta preferencia vive solo en este equipo;
            nadie del equipo, ni un admin, puede ver si la tienes encendida. Mientras la cámara
            esté activa lo verás en pantalla, y se apaga sola si dejas de usarla.
          </p>
        </div>
      </div>
    </div>
  );
}
