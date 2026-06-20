// Prueba de punta a punta: lee tareas reales del Tasks Tracker + ubica las bases clave.
// Uso: NOTION_TOKEN=... node scripts/notion-sample.mjs

const token = process.env.NOTION_TOKEN;
const H = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

// 1) Ubicar bases clave por nombre
const s = await fetch("https://api.notion.com/v1/search", {
  method: "POST",
  headers: H,
  body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 100 }),
}).then((r) => r.json());

const wanted = ["tasks tracker", "team tracker", "equipo", "planeación", "planeacion", "crm - curva"];
const found = {};
for (const db of s.results || []) {
  const title = (db.title || []).map((t) => t.plain_text).join("").toLowerCase();
  for (const w of wanted) if (title.includes(w)) found[title] = db.id;
}
console.log("== Bases clave encontradas ==");
for (const [t, id] of Object.entries(found)) console.log(`  ${t}: ${id}`);

// 2) Leer 8 tareas reales del Tasks Tracker
const TASKS = "4ad71560-7fb5-8284-bbdd-816cf348f9e4";
const q = await fetch(`https://api.notion.com/v1/databases/${TASKS}/query`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ page_size: 8 }),
}).then((r) => r.json());

console.log(`\n== Tareas reales (mostrando ${(q.results || []).length}) ==`);
for (const p of q.results || []) {
  const props = p.properties;
  const name = (props["Task name"]?.title || []).map((t) => t.plain_text).join("") || "(sin nombre)";
  const status = props["Status"]?.status?.name || "—";
  const resp = (props["Responsable"]?.people || []).map((u) => u.name).join(", ") || "—";
  console.log(`  • ${name}  [${status}]  → ${resp}`);
}
