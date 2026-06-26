// Fuente de verdad de datos. "notion" (default) = comportamiento actual (Notion primario).
// "postgres" = lee de Postgres (tras aplicar 0011 + backfill + validación). El flip es por
// flag y reversible: bajar el flag vuelve a Notion. Nada cambia hasta el cutover.
export type DataSource = "notion" | "postgres";
export const DATA_SOURCE: DataSource =
  process.env.NEXT_PUBLIC_SOURCE === "postgres" ? "postgres" : "notion";
