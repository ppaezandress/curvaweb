"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtMXN, totalCliente, IVA, type Proyecto, type DatosBancarios } from "@/lib/reparto";

const KEY = "curva_socios_v1";
const BANCO_FALLBACK: DatosBancarios = { banco: "", producto: "", titular: "", cuenta: "", clabe: "", swift: "" };

// Cotización / propuesta para el CLIENTE: qué se le vende + la inversión, con la
// marca CURVA. NO muestra nada del reparto interno. Lee el proyecto de localStorage.
export default function Cotizacion() {
  const [proj, setProj] = useState<Proyecto | null>(null);
  const [banco, setBanco] = useState<DatosBancarios>(BANCO_FALLBACK);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s?.banco) setBanco({ ...BANCO_FALLBACK, ...s.banco });
      const pid = new URLSearchParams(window.location.search).get("proyecto");
      if (pid && s?.projects) setProj((s.projects as Proyecto[]).find((x) => x.id === pid) || null);
    } catch { /* noop */ }
    setReady(true);
  }, []);

  const base = proj ? Math.max(0, +proj.ticket || 0) : 0;
  const conIVA = !!proj?.conIVA;
  const iva = conIVA ? base * IVA : 0;
  const total = useMemo(() => (proj ? totalCliente(proj) : 0), [proj]);
  const plazoN = Math.max(1, Math.floor(proj?.plazoMeses || 1));
  const scope = (proj?.cotScope || "").split("\n").map((x) => x.trim()).filter(Boolean);

  // Título justo antes de imprimir (Next reaplica el metadata en la hidratación).
  const doPrint = () => { if (proj) document.title = `Cotización · ${proj.nombre}`; window.print(); };
  useEffect(() => {
    if (ready && proj) { const t = setTimeout(doPrint, 500); return () => clearTimeout(t); }
  }, [ready, proj]);

  if (!ready) return <div className="pdf-page">Cargando…</div>;
  if (!proj) return <div className="pdf-page">No encontré ese proyecto. Ábrelo desde la app y vuelve a generar la cotización.</div>;

  const hoy = new Date();
  const fecha = hoy.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const vence = new Date(hoy.getTime() + 15 * 86400000).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const bancoFilas: [string, string][] = [
    ["Banco", banco.banco], ["Titular", banco.titular], ["CLABE", banco.clabe],
  ].filter(([, v]) => v && v.trim()) as [string, string][];

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <button className="btn" onClick={() => window.close()}>Cerrar</button>
        <button className="btn primary" onClick={doPrint}>Imprimir / Guardar PDF</button>
      </div>

      <div className="pdf-sheet">
        <div className="pdf-hero bank">
          <div className="pdf-word">CURVA</div>
          <h1>Cotización</h1>
          <div className="pdf-sub">{proj.nombre}{proj.clienteNombre ? ` · para ${proj.clienteNombre}` : ""}</div>
        </div>
        <div className="pdf-body">
          <div className="pdf-foot" style={{ marginTop: 0, marginBottom: 20 }}>
            {proj.clienteNombre ? `${proj.clienteNombre}, gracias` : "Gracias"} por tu confianza. Esta es nuestra propuesta{scope.length ? " y lo que incluye" : ""}.
          </div>

          {scope.length > 0 && (
            <>
              <h3 className="pdf-h3">Qué incluye</h3>
              <div style={{ marginBottom: 22 }}>
                {scope.map((s, i) => (
                  <div key={i} className="pdf-line"><span className="pl">{s}</span><span className="pv" style={{ color: "var(--pos)" }}>✓</span></div>
                ))}
              </div>
            </>
          )}

          <h3 className="pdf-h3">Inversión</h3>
          <div className="bank-amt">
            <div className="bank-amt-row"><span>Total</span><b>{fmtMXN(total)}</b></div>
          </div>
          <div className="bank-fields">
            {conIVA && <div className="bank-f"><span className="bank-fl">Subtotal</span><span className="bank-fv">{fmtMXN(base)}</span></div>}
            {conIVA && <div className="bank-f"><span className="bank-fl">IVA (16%)</span><span className="bank-fv">{fmtMXN(iva)}</span></div>}
            <div className="bank-f"><span className="bank-fl">{conIVA ? "Total (con IVA)" : "Total"}</span><span className="bank-fv"><b>{fmtMXN(total)} MXN</b></span></div>
            {plazoN > 1 && <div className="bank-f"><span className="bank-fl">Forma de pago</span><span className="bank-fv">{plazoN} pagos de {fmtMXN(total / plazoN)}</span></div>}
          </div>

          {bancoFilas.length > 0 && (
            <>
              <h3 className="pdf-h3" style={{ marginTop: 22 }}>Cómo continuar</h3>
              <div className="bank-fields">
                {bancoFilas.map(([l, v]) => <div key={l} className="bank-f"><span className="bank-fl">{l}</span><span className="bank-fv">{v}</span></div>)}
              </div>
            </>
          )}

          <div className="pdf-foot">
            Cotización válida hasta el <b>{vence}</b>. Para arrancar, confírmanos y transfiere el {plazoN > 1 ? "primer pago" : "anticipo acordado"}.<br />
            <b>CURVA</b> · {fecha}
          </div>
        </div>
      </div>
    </div>
  );
}
