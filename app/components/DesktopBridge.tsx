"use client";

import { useEffect, useRef } from "react";
import { useApp, useLiveElapsed } from "@/lib/app-context";
import { formatClock } from "@/lib/format";
import { categorizeFocus } from "@/lib/app-category";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Puente con la app de escritorio (Tauri). Sin notificaciones molestas:
// cronómetro en la barra de menú, idle del sistema y app en foco.
export function DesktopBridge() {
  const { active, stop, markActivity, setFocus } = useApp();
  const elapsed = useLiveElapsed();
  const lastTitle = useRef("");
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const markRef = useRef(markActivity);
  markRef.current = markActivity;
  const setFocusRef = useRef(setFocus);
  setFocusRef.current = setFocus;

  // 1) Cronómetro en la barra de menú del Mac.
  useEffect(() => {
    if (!isTauri()) return;
    const title = active ? `▶ ${formatClock(elapsed)}` : "⏱ CURVA";
    if (title === lastTitle.current) return;
    lastTitle.current = title;
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_tray_title", { title }))
      .catch(() => {});
  }, [active, elapsed]);

  // 2) "Detener" desde el menú de la barra de menú → detiene el cronómetro.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen("tray-stop", () => stopRef.current()).then((u) => { unlisten = u; }),
    );
    return () => { if (unlisten) unlisten(); };
  }, []);

  // 3) Idle del SISTEMA: actividad en CUALQUIER app del Mac marca actividad
  //    → trabajar en Notion no se confunde con estar inactivo.
  useEffect(() => {
    if (!isTauri()) return;
    let id: ReturnType<typeof setInterval> | undefined;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      id = setInterval(async () => {
        try {
          const s = (await invoke("system_idle_seconds")) as number;
          if (typeof s === "number" && s < 2) markRef.current();
        } catch { /* noop */ }
      }, 1000);
    });
    return () => { if (id) clearInterval(id); };
  }, []);

  // 4) App en foco (contexto: Notion vs Netflix). Solo mientras corre el reloj.
  useEffect(() => {
    if (!isTauri()) return;
    if (!active) { setFocusRef.current(null); return; }
    let id: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      const poll = async () => {
        try {
          const raw = (await invoke("frontmost_app")) as string;
          const [app = "", title = ""] = (raw || "").split("|");
          if (!cancelled) setFocusRef.current(app || title ? categorizeFocus(app, title) : null);
        } catch { /* noop */ }
      };
      poll();
      id = setInterval(poll, 4000);
    });
    return () => { cancelled = true; if (id) clearInterval(id); };
  }, [active]);

  return null;
}
