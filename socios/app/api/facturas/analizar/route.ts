import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lo que devolvemos al frontend (mismo shape que antes, para no tocar la UI).
const Factura = z.object({
  proveedor: z.string(),
  concepto: z.string(),
  subtotal: z.number().nullable(),
  iva: z.number().nullable(),
  total: z.number(),
  moneda: z.string().default("MXN"),
  fecha: z.string().nullable(),
  rfc_emisor: z.string().nullable(),
  categoria_sugerida: z.enum(["overhead", "proyecto"]),
  razon_categoria: z.string(),
});
type Factura = z.infer<typeof Factura>;

// Proveedores que casi siempre son overhead general de CURVA (no de un proyecto).
const OVERHEAD_HINTS = [
  "anthropic", "claude", "openai", "chatgpt", "notion", "google", "microsoft",
  "vercel", "supabase", "adobe", "zoom", "slack", "figma", "github", "amazon web",
  "aws", "hosting", "dominio", "cloudflare", "canva", "linear", "contad", "despacho",
  "honorarios contables", "telcel", "at&t", "izzi", "totalplay", "cfe",
];

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Clasifica overhead vs proyecto por el nombre/RFC del emisor. Ante la duda, overhead.
function clasificar(proveedor: string, rfc: string | null): { cat: "overhead" | "proyecto"; razon: string } {
  const hay = `${proveedor} ${rfc ?? ""}`.toLowerCase();
  const hit = OVERHEAD_HINTS.find((k) => hay.includes(k));
  if (hit) return { cat: "overhead", razon: `"${proveedor}" es una herramienta/servicio general de CURVA.` };
  return { cat: "overhead", razon: "No identifiqué que sea insumo de un proyecto específico; revísalo y cámbialo a proyecto si aplica." };
}

// Parsea un CFDI (XML) 3.3 o 4.0. Gratis, exacto, sin IA.
function parseCFDI(xml: string): Factura {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  const doc = parser.parse(xml);
  const comp = doc?.Comprobante;
  if (!comp) throw new Error("El XML no parece un CFDI (falta el nodo Comprobante).");

  const emisor = comp.Emisor ?? {};
  const proveedor: string = String(emisor["@_Nombre"] ?? "Proveedor").trim();
  const rfc: string | null = emisor["@_Rfc"] ? String(emisor["@_Rfc"]).trim() : null;

  // Conceptos → puede ser objeto único o arreglo.
  const cRaw = comp.Conceptos?.Concepto;
  const conceptos = Array.isArray(cRaw) ? cRaw : cRaw ? [cRaw] : [];
  const desc = conceptos.map((c) => String(c?.["@_Descripcion"] ?? "").trim()).filter(Boolean);
  const concepto = (desc.join(" · ") || "Sin concepto").slice(0, 120);

  // IVA: TotalImpuestosTrasladados del nodo Impuestos global del comprobante.
  const iva = num(comp.Impuestos?.["@_TotalImpuestosTrasladados"]);

  const fechaFull = comp["@_Fecha"] ? String(comp["@_Fecha"]) : null;
  const fecha = fechaFull ? fechaFull.slice(0, 10) : null; // AAAA-MM-DD

  const total = num(comp["@_Total"]) ?? 0;
  const { cat, razon } = clasificar(proveedor, rfc);

  return {
    proveedor,
    concepto,
    subtotal: num(comp["@_SubTotal"]),
    iva,
    total,
    moneda: comp["@_Moneda"] ? String(comp["@_Moneda"]) : "MXN",
    fecha,
    rfc_emisor: rfc,
    categoria_sugerida: cat,
    razon_categoria: razon,
  };
}

// Fallback OPCIONAL con Claude visión — apagado por defecto (cuesta tokens).
async function analizarConVision(imageBase64: string, mediaType: string): Promise<Factura> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const SYSTEM = `Eres el asistente contable de CURVA (consultora, México, MXN).
Analiza la imagen de una factura/ticket y extrae los datos en JSON.
- Montos en MXN, solo números (sin símbolos ni comas).
- Herramienta general (Claude, Notion, ChatGPT, hosting, contadora) → categoria_sugerida="overhead".
- Insumo comprado PARA un proyecto → "proyecto". Ante la duda, "overhead".
- Responde SOLO llamando a la herramienta registrar_factura.`;
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM,
    tools: [{
      name: "registrar_factura",
      description: "Registra los datos extraídos de la factura",
      input_schema: {
        type: "object",
        properties: {
          proveedor: { type: "string" }, concepto: { type: "string" },
          subtotal: { type: ["number", "null"] }, iva: { type: ["number", "null"] },
          total: { type: "number" }, moneda: { type: "string" },
          fecha: { type: ["string", "null"] }, rfc_emisor: { type: ["string", "null"] },
          categoria_sugerida: { type: "string", enum: ["overhead", "proyecto"] },
          razon_categoria: { type: "string" },
        },
        required: ["proveedor", "concepto", "total", "categoria_sugerida", "razon_categoria"],
      },
    }],
    tool_choice: { type: "tool", name: "registrar_factura" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: (mediaType as "image/jpeg" | "image/png") || "image/jpeg", data: imageBase64 } },
        { type: "text", text: "Extrae los datos de esta factura." },
      ],
    }],
  });
  const toolUse = msg.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("no se pudo leer la factura");
  return Factura.parse(toolUse.input);
}

export async function POST(req: NextRequest) {
  let body: { xml?: string; imageBase64?: string; mediaType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "body inválido" }, { status: 400 }); }

  // Camino GRATIS: XML (CFDI). Preferido siempre.
  if (body.xml) {
    try {
      const factura = Factura.parse(parseCFDI(body.xml));
      return NextResponse.json({ ok: true, factura, fuente: "cfdi" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `No pude leer el CFDI: ${(e as Error).message}` }, { status: 422 });
    }
  }

  // Camino imagen: solo si activaste la visión (cuesta tokens).
  if (body.imageBase64) {
    const visionOn = process.env.FACTURAS_VISION === "on" && !!process.env.ANTHROPIC_API_KEY;
    if (!visionOn) {
      return NextResponse.json({
        ok: false,
        error: "Para no gastar, sube el XML (CFDI) de la factura — lo leo gratis y exacto. La foto solo la leo si activas Claude visión (FACTURAS_VISION=on).",
      }, { status: 422 });
    }
    try {
      const factura = await analizarConVision(body.imageBase64, body.mediaType || "image/jpeg");
      return NextResponse.json({ ok: true, factura, fuente: "vision" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "falta el XML (CFDI) o una imagen" }, { status: 400 });
}
