// Explora las bases de Notion a las que tiene acceso la integración.
// Uso: node --env-file=.env.local scripts/notion-explore.mjs
// NO imprime el token; solo nombres, IDs y campos de cada base.

const token = process.env.NOTION_TOKEN;
if (!token || !token.startsWith("ntn_")) {
  console.error("✗ No encuentro un NOTION_TOKEN válido en .env.local");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

const res = await fetch("https://api.notion.com/v1/search", {
  method: "POST",
  headers,
  body: JSON.stringify({
    filter: { property: "object", value: "database" },
    page_size: 100,
  }),
});

const data = await res.json();
if (!res.ok) {
  console.error("✗ Error de Notion:", res.status, data?.code, "-", data?.message);
  console.error("  (¿Compartiste la página 'CURVA - Centro de Control' con la conexión?)");
  process.exit(1);
}

const dbs = data.results || [];
console.log(`\n✓ La integración ve ${dbs.length} base(s):\n`);

for (const db of dbs) {
  const title = (db.title || []).map((t) => t.plain_text).join("") || "(sin título)";
  console.log(`■ ${title}`);
  console.log(`  id: ${db.id}`);
  const props = db.properties || {};
  const list = Object.entries(props).map(([name, p]) => `${name} [${p.type}]`);
  console.log(`  campos: ${list.join(", ")}`);
  console.log("");
}
