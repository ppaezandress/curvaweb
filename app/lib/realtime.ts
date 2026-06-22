// Emite eventos en vivo vía Supabase Realtime (broadcast) desde el servidor.
// No requiere tabla: el cliente se suscribe al topic "ai-live" y recibe el push al instante.
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const AI_LIVE_TOPIC = "ai-live";

export async function broadcastAI(payload: Record<string, unknown>): Promise<void> {
  if (!URL || !KEY) return;
  try {
    await fetch(`${URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: AI_LIVE_TOPIC, event: "ai", payload }] }),
    });
  } catch {
    /* el push es best-effort; el cliente tiene respaldo por polling lento */
  }
}
