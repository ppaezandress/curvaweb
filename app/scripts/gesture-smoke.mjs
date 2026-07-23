// Prueba de humo del control por gestos, sobre la app REAL y con una cámara simulada.
//
// Existe porque el pipeline de la cámara no se puede verificar leyendo el código: durante una
// tarde entera creímos que funcionaba y en la máquina del usuario estaba muerto. Esto responde,
// en 40 segundos y sin cámara real, tres preguntas:
//   1. ¿arranca el motor?
//   2. ¿de dónde saca los cuadros — del flujo de la cámara o del <video>?
//   3. ¿sigue analizando con la pestaña oculta?
//
// Cómo se corre (hace falta un build sin backend, para entrar con el selector de miembros):
//   NEXT_PUBLIC_GESTURES=1 NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run build
//   npx next start -p 3200 &
//   node scripts/gesture-smoke.mjs
//
// OJO: el navegador de pruebas NO congela requestAnimationFrame como lo hace un Chrome normal,
// así que "siguió analizando" aquí no garantiza el segundo plano real. Lo que sí verifica de
// forma fiable es que el origen sea "cámara directa": ese es el camino que sobrevive cuando el
// navegador frena la pestaña.
import { chromium } from "playwright";

const URL = "http://localhost:3200/labs/gestos";

const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ permissions: ["camera"] });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 160)));

// Entrar primero (modo sin backend: selector de miembros).
await page.goto("http://localhost:3200/login", { waitUntil: "networkidle" });
await page.getByText("Andrés Páez").first().click();
await page.waitForURL(/dashboard|tareas|\/$/, { timeout: 20_000 }).catch(() => {});
await page.goto(URL, { waitUntil: "networkidle" });

const encender = page.getByRole("button", { name: /Encender cámara/i });
await encender.waitFor({ timeout: 30_000 });
await encender.click();

// Espera a que el panel reporte cuadros analizados.
const readFrames = async () => {
  const txt = await page.locator("dt", { hasText: "Cuadros analizados" }).locator("xpath=following-sibling::dd[1]").innerText().catch(() => "0");
  return Number(txt.replace(/\D/g, "")) || 0;
};
const readSource = async () =>
  page.locator("dt", { hasText: "Origen" }).locator("xpath=following-sibling::dd[1]").innerText().catch(() => "?");
const readRecv = async () =>
  page.locator("dt", { hasText: "Cuadros de cámara" }).locator("xpath=following-sibling::dd[1]").innerText().catch(() => "?");

await page.waitForTimeout(12_000);
const visibleFrames = await readFrames();
const source = await readSource();
console.log(`VISIBLE   → analizados: ${visibleFrames} · origen: ${source} · recibidos de cámara: ${await readRecv()}`);

// Ocultar de verdad: otra pestaña al frente.
const other = await ctx.newPage();
await other.goto("about:blank");
await other.bringToFront();
await other.waitForTimeout(15_000);
await page.bringToFront();
await page.waitForTimeout(1500);

const afterFrames = await readFrames();
console.log(`OCULTA 15s → cuadros: ${afterFrames} (+${afterFrames - visibleFrames})`);
console.log(afterFrames > visibleFrames + 10
  ? "✅ SIGUIÓ ANALIZANDO con la pestaña oculta"
  : "❌ SE DETUVO al ocultarse la pestaña");

if (errors.length) console.log("\nerrores de consola:\n - " + errors.slice(0, 6).join("\n - "));
await browser.close();
