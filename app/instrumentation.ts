import type { Instrumentation } from "next";

// Red de seguridad global: cualquier error que Next capture (render de un Server Component,
// un route handler que revienta, una Server Action) pasa por aquí. Cubre lo que los
// try/catch de cada ruta NO ven — que es justo lo que hoy no sabíamos que estaba pasando.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Import dinámico: instrumentation.ts se carga en el arranque del servidor y no queremos
  // jalar el cliente de Supabase (ni sus envs) hasta que de verdad haya un error.
  const { logError } = await import("@/lib/observability");
  await logError(`next:${context.routeType}`, err, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routerKind: context.routerKind,
  });
};
