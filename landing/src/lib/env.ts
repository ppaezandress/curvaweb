// Lee variables de entorno en runtime (Vercel) o en build. NUNCA hardcodear
// credenciales: todo vive en env. `import.meta.env` para build, `process.env`
// para runtime serverless.
export function env(key: string): string | undefined {
  // @ts-ignore — process existe en el runtime de las funciones de Vercel
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return fromProcess ?? (import.meta as any).env?.[key];
}
