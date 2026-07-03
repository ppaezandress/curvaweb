# CURVA landing — Guía de despliegue y hardening

Estos pasos activan el chat IA, la tienda y la seguridad. El código ya está listo;
esto lo aplicas tú en tus cuentas (Vercel / Supabase).

## 1. Variables de entorno (Vercel → Project → Settings → Environment Variables)

Chat IA (Vercel AI SDK + AI Gateway):
- `AI_GATEWAY_API_KEY` — llave del AI Gateway. En Vercel también funciona con OIDC; la key es lo más simple.
- `LLM_MODEL` — id del modelo (def. `openai/gpt-oss-120b`). Lista: `curl https://ai-gateway.vercel.sh/v1/models`.
- `LLM_TRANSCRIBE_MODEL` — transcripción (def. `openai/whisper-1`).

Leads (Supabase):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — **solo server**. Nunca la pongas con prefijo `PUBLIC_` ni en el frontend.

Rate limit (opcional; hay fallback en memoria):
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

Tienda de plantillas (Pendiente #1 — elige uno):
- `PLANTILLAS_CHECKOUT_URL` — base de un checkout hospedado, o
- `PLANTILLAS_WEBHOOK` — webhook n8n que cobra + entrega (si falta, usa `PUBLIC_LEADMAGNET_WEBHOOK`).

Sin `AI_GATEWAY_API_KEY` el chat responde con un mensaje de respaldo + CTA (no se rompe).

## 2. Base de datos (Supabase)

En el SQL Editor de tu proyecto, corre `db/schema.sql`. Crea `curva_leads` y
`curva_chat_messages` con **RLS activado y sin políticas públicas**: solo la
service-role key (backend) accede; el cliente anónimo no.

## 3. Seguridad de borde

- **Headers**: `vercel.json` ya define HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy (micrófono permitido para el audio del chat) y una **CSP en
  modo Report-Only**. Tras verificar en producción que no rompe nada (revisa la
  consola por reportes de CSP), cambia la clave `Content-Security-Policy-Report-Only`
  a `Content-Security-Policy` para hacerla obligatoria.
- **Firewall / WAF** (Vercel → Firewall): agrega una regla de rate-limit para la
  ruta `/api/*` (p. ej. 60 req/min por IP) y ten a mano el **Attack Challenge Mode**
  para los endpoints que consumen LLM. Esto complementa el rate-limit de la app.

## 4. Monitoreo

Vercel Observability (Logs + Runtime Logs) ya captura los `console.error` de los
endpoints (`[chat]`, `[transcribe]`). Configura una alerta ahí sobre errores de
`/api/chat` para enterarte de fallos o picos de costo del LLM. (Opcional: integrar
Sentry con `@sentry/astro` gated por `SENTRY_DSN` si quieres trazas más ricas.)

## 5. Advisories de dependencias (dependency-hygiene)

`npm audit` deja 5 advisories que requieren `npm audit fix --force` (bump de major
de vite/astro). Son de **tooling de desarrollo** (vite dev-server) y no se exponen
en el output de producción (estático + funciones serverless). Trátalo como un
upgrade mayor aparte y probado, no en este barrido.

## 6. Verificación post-deploy

- El chat responde y cita casos con deep-links; el audio transcribe.
- `curl -X POST https://TU-DOMINIO/api/chat` con `Origin` ajeno → 403.
- Headers presentes: `curl -sI https://TU-DOMINIO/ | grep -i "strict-transport\|content-security"`.
- Leads caen en Supabase (`curva_leads` / `curva_chat_messages`).
