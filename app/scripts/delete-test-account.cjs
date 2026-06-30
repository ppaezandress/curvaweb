// Borra la cuenta de PRUEBA x@nope.com (auth + profile). Uso: node scripts/delete-test-account.cjs
// Lee la service role key de .env.local. NO borra cuentas reales (solo x@nope.com).
const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
raw.split("\n").forEach((l) => {
  if (!l || l.startsWith("#")) return;
  const i = l.indexOf("=");
  if (i < 0) return;
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
});
const u = env.NEXT_PUBLIC_SUPABASE_URL;
const k = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
const TARGET = "x@nope.com";

(async () => {
  const profs = await (await fetch(`${u}/rest/v1/profiles?email=eq.${TARGET}&select=id,name`, { headers: H })).json();
  if (!profs.length) { console.log(`${TARGET}: no existe (ya limpio).`); return; }
  const id = profs[0].id;
  console.log(`Borrando ${TARGET} (id ${id})…`);
  const a = await fetch(`${u}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H });
  console.log("  auth user → HTTP", a.status);
  const p = await fetch(`${u}/rest/v1/profiles?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  console.log("  profile   → HTTP", p.status);
  const left = await (await fetch(`${u}/rest/v1/profiles?select=email,is_admin&order=email`, { headers: H })).json();
  console.log("\nPerfiles restantes:");
  left.forEach((x) => console.log(`  ${x.is_admin ? "👑" : "  "} ${x.email}`));
})();
