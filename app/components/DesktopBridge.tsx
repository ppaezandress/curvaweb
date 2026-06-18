"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { formatClock, formatDuration } from "@/lib/format";
import { taskById } from "@/lib/mock-data";
import { categorizeFocus } from "@/lib/app-category";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Notificación que funciona en escritorio (Tauri) y en web/PWA (API del navegador).
async function notify(title: string, body: string) {
  try {
    if (isTauri()) {
      const n = await import("@tauri-apps/plugin-notification");
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === "granted";
      if (granted) n.sendNotification({ title, body });
    } else if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") new Notification(title, { body });
      else if (Notification.permission !== "denied") {
        const p = await Notification.requestPermission();
        if (p === "granted") new Notification(title, { body });
      }
    }
  } catch {
    // sin notificaciones disponibles: no pasa nada
  }
}

// Cada cuánto recordar que el cronómetro sigue corriendo (sesión larga).
// Producción: 1h. Override demo vía localStorage "curva.reminderSeconds".
function reminderSeconds() {
  if (typeof window === "undefined") return 3600;
  const raw = Number(localStorage.getItem("curva.reminderSeconds"));
  return raw > 0 ? raw : 3600;
}

export function DesktopBridge() {
  const { active, elapsed, nudge, stop, markActivity, setFocus } = useApp();
  const lastTitle = useRef("");
  const nextReminder = useRef(reminderSeconds());
  const prevNudge = useRef(false);
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

  // 2) Recordatorio de sesión larga ("llevas Xh en…").
  useEffect(() => {
    if (!active) {
      nextReminder.current = reminderSeconds();
      return;
    }
    if (elapsed >= nextReminder.current) {
      const task = taskById[active.taskId];
      notify(
        "Sigues midiendo tiempo ⏱",
        `Llevas ${formatDuration(elapsed)} en «${task?.name ?? "tu tarea"}».`,
      );
      nextReminder.current += reminderSeconds();
    }
  }, [active, elapsed]);

  // 3) Notificación cuando se detecta inactividad (te llega aunque estés en otra app).
  useEffect(() => {
    const has = !!nudge;
    if (has && !prevNudge.current) {
      const task = nudge ? taskById[nudge.taskId] : undefined;
      notify(
        "¿Sigues trabajando? 👀",
        `Sin actividad en «${task?.name ?? "tu tarea"}». Abre CURVA para conservar o descartar ese tiempo.`,
      );
    }
    prevNudge.current = has;
  }, [nudge]);

  // 4) "Detener" desde el menú de la barra de menú → detiene el cronómetro.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen("tray-stop", () => stopRef.current()).then((u) => {
        unlisten = u;
      }),
    );
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 5) Idle del SISTEMA: si hay actividad en CUALQUIER app del Mac, marcamos
  //    actividad → trabajar en Notion ya no se confunde con estar inactivo.
  useEffect(() => {
    if (!isTauri()) return;
    let id: ReturnType<typeof setInterval> | undefined;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      id = setInterval(async () => {
        try {
          const s = (await invoke("system_idle_seconds")) as number;
          if (typeof s === "number" && s < 2) markRef.current();
        } catch {
          /* noop */
        }
      }, 1000);
    });
    return () => {
      if (id) clearInterval(id);
    };
  }, []);

  // 6) App en foco (contexto: Notion vs Netflix). Solo mientras corre el reloj.
  useEffect(() => {
    if (!isTauri()) return;
    if (!active) {
      setFocusRef.current(null);
      return;
    }
    let id: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      const poll = async () => {
        try {
          // Formato del comando: "NombreApp|TítuloVentana"
          const raw = (await invoke("frontmost_app")) as string;
          const [app = "", title = ""] = (raw || "").split("|");
          if (!cancelled) {
            setFocusRef.current(app || title ? categorizeFocus(app, title) : null);
          }
        } catch {
          /* noop */
        }
      };
      poll();
      id = setInterval(poll, 4000);
    });
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [active]);

  return null;
}
