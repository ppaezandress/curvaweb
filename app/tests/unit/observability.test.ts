import { describe, it, expect } from "vitest";
import { sanitize, fingerprint, messageOf } from "@/lib/observability";

// La bitácora de errores es nueva y toca datos sensibles: si filtra un token de Notion o de
// Spotify a una tabla o a los logs de Vercel, el remedio sale peor que la enfermedad.

describe("sanitize", () => {
  it("redacta cualquier clave que huela a credencial", () => {
    const out = sanitize({
      notionToken: "secret_abc123",
      apiKey: "sk-live-xyz",
      authorization: "Bearer abc",
      cookie: "sb-access-token=…",
      password: "hunter2",
      taskId: "abc-123",
    }) as Record<string, unknown>;

    expect(out.notionToken).toBe("[redactado]");
    expect(out.apiKey).toBe("[redactado]");
    expect(out.authorization).toBe("[redactado]");
    expect(out.cookie).toBe("[redactado]");
    expect(out.password).toBe("[redactado]");
    expect(out.taskId).toBe("abc-123"); // lo que no es secreto sí se conserva
  });

  it("redacta también dentro de objetos anidados", () => {
    const out = sanitize({ request: { headers: { authorization: "Bearer x" } } }) as {
      request: { headers: { authorization: string } };
    };
    expect(out.request.headers.authorization).toBe("[redactado]");
  });

  it("recorta strings larguísimos para no llenar la tabla", () => {
    const out = sanitize("x".repeat(2000)) as string;
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.endsWith("…")).toBe(true);
  });

  it("corta la profundidad en vez de guardar un objeto de Notion entero", () => {
    const out = sanitize({ a: { b: { c: { d: "muy hondo" } } } }) as Record<string, Record<string, unknown>>;
    expect(out.a.b).toEqual({ c: "[…]" });
  });

  it("acota los arreglos largos", () => {
    const out = sanitize(Array.from({ length: 100 }, (_, i) => i)) as number[];
    expect(out).toHaveLength(20);
  });

  it("conserva primitivos y nulos tal cual", () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("un Error se guarda como nombre + mensaje, sin arrastrar propiedades raras", () => {
    expect(sanitize(new Error("tronó"))).toEqual({ name: "Error", message: "tronó" });
  });
});

describe("fingerprint", () => {
  it("agrupa el mismo error aunque cambien los ids y los números", () => {
    const a = fingerprint("api/time-entries POST", "no existe la página 8f3b21ca-0f22-4a1e-9a11-2b7c0d5e6f70");
    const b = fingerprint("api/time-entries POST", "no existe la página 11112222-3333-4444-5555-666677778888");
    expect(a).toBe(b);
  });

  it("no mezcla errores de rutas distintas", () => {
    expect(fingerprint("api/tasks POST", "falló")).not.toBe(fingerprint("api/data GET", "falló"));
  });

  it("normaliza mayúsculas y espacios de más", () => {
    expect(fingerprint("x", "Falló   LA   cosa")).toBe(fingerprint("x", "falló la cosa"));
  });
});

describe("messageOf", () => {
  it("saca el mensaje de un Error, de un string y de cualquier otra cosa", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf("texto plano")).toBe("texto plano");
    expect(messageOf({ code: 429 })).toContain("429");
  });

  it("un Error sin mensaje cae a su nombre en vez de a cadena vacía", () => {
    expect(messageOf(new TypeError())).toBe("TypeError");
  });
});
