# Observabilidad — cómo saber qué se está rompiendo

Antes de esto, la app fallaba en silencio: los `catch` de las rutas devolvían una respuesta
degradada y el error no dejaba rastro. Nos enterábamos cuando alguien del equipo mandaba un
screenshot, días después. Ahora todo error queda registrado en dos lugares.

## Los dos destinos

| Destino | Qué tiene | Cuánto dura | Cómo se ve |
|---|---|---|---|
| Logs de Vercel | Una línea JSON por evento | Poco (según el plan) | Runtime Logs del proyecto |
| Tabla `app_errors` (Supabase) | El histórico completo | Permanente | SQL Editor |

## Puesta en marcha (una sola vez)

1. Aplicar `supabase/migrations/0029_app_errors.sql` en el **SQL Editor** de Supabase.
2. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está en las envs de Vercel. Sin ella el sink
   persistente se salta y solo quedan los logs de Vercel (la app **no** se rompe).

## Consultas útiles

Qué está fallando más en los últimos 7 días:

```sql
select fingerprint, count(*) as veces, max(created_at) as ultima, max(message) as ejemplo
from app_errors
where created_at > now() - interval '7 days'
group by fingerprint
order by veces desc;
```

Lo último que tronó, con contexto:

```sql
select created_at, scope, message, meta, release
from app_errors
order by created_at desc
limit 50;
```

¿Se perdió tiempo medido de alguien?

```sql
select created_at, message, meta
from app_errors
where scope in ('api/time-entries POST', 'client/notion-sync')
order by created_at desc;
```

`release` es el SHA corto del despliegue: sirve para confirmar si un error murió con el
último deploy o sigue vivo.

## Cómo se usa desde el código

Servidor (`lib/observability.ts`):

```ts
try { … } catch (e) {
  await logError("api/loquesea POST", e, { userId: auth.user.id, taskId });
  return NextResponse.json({ ok: false, error: "…" }, { status: 500 });
}
```

Navegador (`lib/report-error.ts`), para fallos que solo existen en el cliente — el POST del
cronómetro que no sale, un registro manual que revienta:

```ts
reportClientError("notion-sync", err, { entryId, seconds });
```

Reglas de la capa:

- **Nunca rompe la request.** Si el sink falla, se traga el fallo y sigue.
- **Nunca guarda secretos.** `sanitize` redacta cualquier clave que huela a credencial
  (`token`, `key`, `secret`, `authorization`, `cookie`…), incluso anidada. Probado en
  `tests/unit/observability.test.ts`.
- **Agrupa por `fingerprint`**: mismo error con distintos ids/números = misma firma.
- **El reporte del cliente está limitado**: mismo error una vez cada 5 minutos por pestaña,
  y 20 por usuario cada 5 minutos en el servidor. Un bucle de reintentos no inunda la tabla.

## Lo que todavía NO hay

No hay **alertas**: nadie recibe un correo cuando algo falla, hay que ir a mirar. El siguiente
paso natural es enganchar Sentry (o un webhook a un canal del chat) en la función `emit` de
`lib/observability.ts` — está aislada justo para eso: se cambia en un solo lugar, sin tocar
los call sites.
