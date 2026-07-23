// Corre la sonda con una cámara falsa y la pestaña realmente oculta.
// Responde: ¿qué eslabón de la cadena muere cuando cambias de pestaña?
import { chromium } from "playwright";

const URL_PROBE = "http://localhost:3200/bg-probe.html";
const HIDDEN_SECONDS = 12;

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    "--use-fake-device-for-media-stream", // cámara sintética: no hace falta una real
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const ctx = await browser.newContext({ permissions: ["camera"] });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 140)); });

await page.goto(URL_PROBE);
await page.waitForFunction(() => window.stats?.ready === true, null, { timeout: 60_000 });
console.log("motor listo, midiendo 5 s con la pestaña VISIBLE…");
await page.waitForTimeout(5000);
const visible = await page.evaluate(() => ({ ...window.stats }));

// Forzar la ocultación por protocolo: bringToFront no siempre dispara visibilitychange.
// Sin API para forzarlo: se simula el estado oculto en la propia página (document.hidden
// y el evento). Esto valida la LÓGICA de la app; el frenado real del navegador es aparte.
await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
  Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
const other = await ctx.newPage();
await other.goto("about:blank");
await other.bringToFront();
console.log(`pestaña oculta, esperando ${HIDDEN_SECONDS} s…`);
await other.waitForTimeout(HIDDEN_SECONDS * 1000);

const after = await page.evaluate(() => ({ ...window.stats }));
console.log("¿la página se dio por oculta?:", after.hiddenAt ? "SÍ" : "NO — la medición no vale");
await browser.close();

const atHide = after.atHide || {};
const delta = (k) => (after[k] ?? 0) - (atHide[k] ?? 0);
const perSec = (k) => (delta(k) / HIDDEN_SECONDS).toFixed(1);

console.log("\n=== CON LA PESTAÑA OCULTA (por segundo) ===");
console.log(`  worker (temporizador)      ${perSec("worker")}/s   ${delta("worker") > 0 ? "VIVO" : "MUERTO"}`);
console.log(`  requestAnimationFrame      ${perSec("rafTicks")}/s   ${delta("rafTicks") > 0 ? "VIVO" : "MUERTO (esperado)"}`);
console.log(`  cuadros de la cámara       ${perSec("frames")}/s   ${delta("frames") > 0 ? "VIVO" : "MUERTO"}`);
console.log(`  inferencia GPU             ${perSec("gpuInfer")}/s   ${delta("gpuInfer") > 0 ? "VIVO" : "MUERTO"}`);
console.log(`  inferencia CPU             ${perSec("cpuInfer")}/s   ${delta("cpuInfer") > 0 ? "VIVO" : "MUERTO"}`);
if (after.gpuError) console.log("  error GPU:", after.gpuError);
if (after.cpuError) console.log("  error CPU:", after.cpuError);
console.log("\n(referencia con la pestaña a la vista:", JSON.stringify({
  worker: visible.worker, raf: visible.rafTicks, frames: visible.frames,
  gpu: visible.gpuInfer, cpu: visible.cpuInfer,
}), ")");
