"use client";
import { useEffect, useMemo, useState } from "react";
import {
  fmtMXN, REGLAS_DEFAULT, reglasDe, membersResolved, compute, isSocio,
  type Proyecto, type Reglas, type RosterPerson, type Pago,
} from "@/lib/reparto";

const KEY = "curva_socios_v1";
const FIRMA_KEYS = { A: "curva_socios_firma_A", B: "curva_socios_firma_B" } as const;
type FirmaSlot = "A" | "B";
const BANCO_FALLBACK = { titular: "" };

// Lee la firma device-local de un socio, migrando la firma única de antes a Andrés.
const readFirma = (slot: FirmaSlot): string => {
  try {
    if (slot === "A") {
      const old = localStorage.getItem("curva_socios_firma");
      if (old && !localStorage.getItem(FIRMA_KEYS.A)) { localStorage.setItem(FIRMA_KEYS.A, old); localStorage.removeItem("curva_socios_firma"); }
    }
    return localStorage.getItem(FIRMA_KEYS[slot]) || "";
  } catch { return ""; }
};

const Word = () => <div className="pdf-word">CURVA</div>;
const fmtFecha = (iso?: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
};

// Un solo generador para los DOS comprobantes:
//  ?tipo=pago&persona=<nombre>          → recibo de pago a la gente (con firma)
//  ?tipo=cobro&proyecto=<id>&pago=<id>  → recibo de cobro al cliente
export default function PdfRecibo() {
  const [state, setState] = useState<{ params: Reglas; projects: Proyecto[]; roster: RosterPerson[]; titular: string } | null>(null);
  const [firmas, setFirmas] = useState<{ A: string; B: string }>({ A: "", B: "" });
  const [signer, setSigner] = useState<FirmaSlot>("A");
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState<{ tipo: string; persona: string; proyecto: string; pago: string }>({ tipo: "", persona: "", proyecto: "", pago: "" });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try {
      const sp = new URLSearchParams(window.location.search);
      setQ({ tipo: sp.get("tipo") || "", persona: sp.get("persona") || "", proyecto: sp.get("proyecto") || "", pago: sp.get("pago") || "" });
      const f = (sp.get("firma") || "").toUpperCase();
      if (f === "A" || f === "B") setSigner(f);
      else { try { const yo = localStorage.getItem("curva_yo"); if (yo === "A" || yo === "B") setSigner(yo); } catch { /* noop */ } } // firma por default = socio logueado
    } catch { /* noop */ }
    setFirmas({ A: readFirma("A"), B: readFirma("B") });
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s?.projects) setState({
        params: { ...REGLAS_DEFAULT, ...(s.params || {}) }, projects: s.projects, roster: s.roster || [],
        titular: (s.banco?.titular || BANCO_FALLBACK.titular),
      });
    } catch { /* noop */ }
    setReady(true);
  }, []);

  // Recibo de PAGO a la gente: suma lo YA transferido a esa persona (equipoPagado)
  // en todos los proyectos vivos. Misma lógica que la vista Cajas.
  const pago = useMemo(() => {
    if (!state || q.tipo !== "pago" || !q.persona) return null;
    const P = state.params;
    const vivos = state.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);
    let monto = 0, fecha = "";
    const proys: { nombre: string; monto: number }[] = [];
    vivos.forEach((p) => {
      const R = reglasDe(p, P);
      const r = compute(membersResolved(p, state.roster, R), R);
      Object.values(r.people).forEach((per) => {
        if (isSocio(per.quien) || per.nombre !== q.persona) return;
        const cut = per.trabajo + per.extra + (per.comision || 0);
        if (cut <= 0.5) return;
        const f = p.equipoPagado?.[per.nombre];
        if (!f) return; // solo lo ya pagado
        monto += cut; proys.push({ nombre: p.nombre, monto: cut });
        if (f > fecha) fecha = f;
      });
    });
    if (monto <= 0.5) return null;
    return { nombre: q.persona, monto, fecha, proys };
  }, [state, q]);

  // Recibo de COBRO al cliente: un pago concreto de un proyecto.
  const cobro = useMemo(() => {
    if (!state || q.tipo !== "cobro" || !q.proyecto || !q.pago) return null;
    const p = state.projects.find((x) => x.id === q.proyecto);
    const pg: Pago | undefined = p?.pagos?.find((x) => x.id === q.pago);
    if (!p || !pg) return null;
    const conIVA = !!p.conIVA;
    const base = +pg.monto || 0;
    const iva = conIVA ? (pg.ivaCobrado ?? base * 0.16) : 0;
    return { proyecto: p, pago: pg, base, iva, total: base + iva, conIVA };
  }, [state, q]);

  useEffect(() => {
    if (ready && (pago || cobro)) {
      const prev = document.title;
      document.title = pago ? `Recibo · ${pago.nombre}` : cobro ? `Recibo de cobro · ${cobro.proyecto.nombre}` : prev;
      const t = setTimeout(() => window.print(), 500);
      return () => { clearTimeout(t); document.title = prev; };
    }
  }, [ready, pago, cobro]);

  if (!ready) return <div className="pdf-page">Cargando…</div>;
  if (!pago && !cobro) return <div className="pdf-page">No encontré datos para este comprobante. Genéralo desde la app.</div>;

  const hoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const firma = firmas[signer];
  const firmante = signer === "A" ? (state!.titular || state!.params.nombreA) : state!.params.nombreB;

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <div className="firma-picker">
          <span>Firma de:</span>
          <div className="chips">
            <button className="chip-btn" aria-pressed={signer === "A"} onClick={() => setSigner("A")}>{state!.params.nombreA}</button>
            <button className="chip-btn" aria-pressed={signer === "B"} onClick={() => setSigner("B")}>{state!.params.nombreB}</button>
          </div>
        </div>
        <button className="btn" onClick={() => window.close()}>Cerrar</button>
        <button className="btn primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>

      {/* ── Comprobante de pago a la gente ── */}
      {pago && (
        <div className="pdf-sheet">
          <div className="pdf-hero bank">
            <Word />
            <h1>Comprobante de pago</h1>
            <div className="pdf-sub">Pago a colaborador · {hoy}</div>
          </div>
          <div className="pdf-body">
            <div className="bank-amt">
              <div className="bank-amt-row"><span>Pagado a {pago.nombre}</span><b>{fmtMXN(pago.monto)}</b></div>
            </div>
            <div className="bank-fields">
              <div className="bank-f"><span className="bank-fl">Beneficiario</span><span className="bank-fv">{pago.nombre}</span></div>
              <div className="bank-f"><span className="bank-fl">Concepto</span><span className="bank-fv">Trabajo en proyectos CURVA</span></div>
              {pago.fecha && <div className="bank-f"><span className="bank-fl">Fecha de pago</span><span className="bank-fv">{fmtFecha(pago.fecha)}</span></div>}
              <div className="bank-f"><span className="bank-fl">Monto</span><span className="bank-fv">{fmtMXN(pago.monto)} MXN</span></div>
            </div>

            {pago.proys.length > 0 && (
              <>
                <h3 className="pdf-h3">Detalle por proyecto</h3>
                {pago.proys.sort((a, b) => b.monto - a.monto).map((x) => (
                  <div className="pdf-line" key={x.nombre}><span className="pl">{x.nombre}</span><span className="pv">{fmtMXN(x.monto)}</span></div>
                ))}
              </>
            )}

            <div className="recibo-firma">
              {firma
                ? <img src={firma} alt="Firma" className="recibo-firma-img" />
                : <div className="recibo-firma-line" />}
              <div className="recibo-firma-cap">{firmante || "CURVA"}<br />Pagado por</div>
            </div>

            <div className="pdf-foot">
              Este comprobante acredita el pago recibido por el colaborador. Monto bruto (antes de impuestos).<br />
              <b>CURVA</b> · {hoy}
            </div>
          </div>
        </div>
      )}

      {/* ── Recibo de cobro al cliente ── */}
      {cobro && (
        <div className="pdf-sheet">
          <div className="pdf-hero bank">
            <Word />
            <h1>Recibo de pago</h1>
            <div className="pdf-sub">{cobro.proyecto.nombre}{cobro.proyecto.clienteNombre ? ` · ${cobro.proyecto.clienteNombre}` : ""}</div>
          </div>
          <div className="pdf-body">
            <div className="bank-amt">
              <div className="bank-amt-row"><span>Pago recibido</span><b>{fmtMXN(cobro.total)}</b></div>
            </div>
            <div className="bank-fields">
              {cobro.proyecto.clienteNombre && <div className="bank-f"><span className="bank-fl">Cliente</span><span className="bank-fv">{cobro.proyecto.clienteNombre}</span></div>}
              <div className="bank-f"><span className="bank-fl">Proyecto</span><span className="bank-fv">{cobro.proyecto.nombre}</span></div>
              <div className="bank-f"><span className="bank-fl">Fecha</span><span className="bank-fv">{fmtFecha(cobro.pago.fecha)}</span></div>
              {cobro.pago.nota && <div className="bank-f"><span className="bank-fl">Concepto</span><span className="bank-fv">{cobro.pago.nota}</span></div>}
              {cobro.pago.facturaRef && <div className="bank-f"><span className="bank-fl">Referencia</span><span className="bank-fv">{cobro.pago.facturaRef}</span></div>}
              {cobro.conIVA && <div className="bank-f"><span className="bank-fl">Subtotal</span><span className="bank-fv">{fmtMXN(cobro.base)}</span></div>}
              {cobro.conIVA && <div className="bank-f"><span className="bank-fl">IVA (16%)</span><span className="bank-fv">{fmtMXN(cobro.iva)}</span></div>}
              <div className="bank-f"><span className="bank-fl"><b>Total recibido</b></span><span className="bank-fv"><b>{fmtMXN(cobro.total)} MXN</b></span></div>
            </div>

            <div className="recibo-firma">
              {firma
                ? <img src={firma} alt="Firma" className="recibo-firma-img" />
                : <div className="recibo-firma-line" />}
              <div className="recibo-firma-cap">{firmante || "CURVA"}<br />Recibí de conformidad</div>
            </div>

            <div className="pdf-foot">
              Acuse de recibo del pago del cliente. Gracias por tu confianza.<br />
              <b>CURVA</b> · {hoy}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
