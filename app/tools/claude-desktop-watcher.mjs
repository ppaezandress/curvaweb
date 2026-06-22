#!/usr/bin/env node
/**
 * Vigilante de Claude Desktop (modo agente) para CURVA Tiempos.
 *
 * Lee SOLO METADATOS de las sesiones de modo-agente que Claude Desktop guarda
 * localmente (tiempos, proyecto/cwd, correo) — NUNCA el contenido de las
 * conversaciones — y reporta el tiempo de IA a la app.
 *
 * Uso:
 *   node app/tools/claude-desktop-watcher.mjs
 *   CURVA_URL=http://127.0.0.1:3000 node app/tools/claude-desktop-watcher.mjs
 *
 * Es best-effort: lee archivos locales (no API oficial), así que una
 * actualización de Claude Desktop podría cambiar el formato.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = process.env.CURVA_URL || "http://127.0.0.1:3000";
const DIR = join(homedir(), "Library", "Application Support", "Claude", "local-agent-mode-sessions");
const POLL_MS = Number(process.env.CURVA_POLL_MS) || 60_000;
const INACTIVE_MS = Number(process.env.CURVA_INACTIVE_MS) || 5 * 60_000; // sesión "cerrada" si no hay actividad en 5 min
// Solo reporta sesiones con actividad reciente — evita inundar con histórico viejo en el primer arranque.
const BACKFILL_MS = Number(process.env.CURVA_BACKFILL_MS) || 2 * 3600_000; // últimas 2h por defecto
const SINCE = Date.now() - BACKFILL_MS;
const reported = new Set(); // sessionId ya reportados (dedup local)

function findSessionFiles(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(findSessionFiles(p));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

// Extrae SOLO los metadatos que necesitamos (ignora messages/contenido).
function readMeta(file) {
  try {
    const o = JSON.parse(readFileSync(file, "utf8"));
    if (!o || !o.sessionId || !o.createdAt) return null;
    return {
      sessionId: String(o.sessionId),
      createdAt: Number(o.createdAt),
      lastActivityAt: Number(o.lastActivityAt || o.createdAt),
      cwd: typeof o.cwd === "string" ? o.cwd : "",
      email: typeof o.emailAddress === "string" ? o.emailAddress : (process.env.CURVA_USER || ""),
      completed: !!o.isAgentCompleted,
    };
  } catch { return null; }
}

async function report(m) {
  try {
    const res = await fetch(`${BASE}/api/timing/desktop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-curva-user": m.email },
      body: JSON.stringify({ email: m.email, cwd: m.cwd, startedAt: m.createdAt, endedAt: m.lastActivityAt, sessionId: m.sessionId }),
    });
    const j = await res.json().catch(() => ({}));
    const mins = ((m.lastActivityAt - m.createdAt) / 60000).toFixed(1);
    if (j.logged) console.log(`✓ sesión ${m.sessionId.slice(0, 8)}… registrada: ${mins} min (${m.cwd.split("/").pop() || "?"})`);
    else console.log(`· sesión ${m.sessionId.slice(0, 8)}… ${j.skipped || "no registrada"}`);
  } catch (e) {
    console.log("⚠ no se pudo reportar (¿app corriendo en " + BASE + "?):", String(e).slice(0, 60));
  }
}

async function tick() {
  const files = findSessionFiles(DIR);
  const now = Date.now();
  for (const f of files) {
    const m = readMeta(f);
    if (!m || reported.has(m.sessionId)) continue;
    // Ignora histórico viejo: marca como visto sin enviar.
    if (m.lastActivityAt < SINCE) { reported.add(m.sessionId); continue; }
    const inactive = now - m.lastActivityAt;
    // Reporta solo sesiones terminadas o inactivas (ya "cerradas").
    if (m.completed || inactive > INACTIVE_MS) {
      if (m.lastActivityAt > m.createdAt) { reported.add(m.sessionId); await report(m); }
    }
  }
}

console.log(`CURVA · vigilante de Claude Desktop → ${BASE}`);
console.log(`Carpeta: ${DIR}`);
console.log("Solo se leen metadatos (tiempos/proyecto/correo). Ctrl+C para detener.\n");
tick();
setInterval(tick, POLL_MS);
