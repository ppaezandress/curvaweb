"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtMXN, totalCliente, type Proyecto, type DatosBancarios } from "@/lib/reparto";

const KEY = "curva_socios_v1";
const BANCO_FALLBACK: DatosBancarios = { banco: "", producto: "", titular: "", cuenta: "", clabe: "", swift: "" };

// Ficha de cobro de CURVA: datos bancarios en una hoja con la marca (solo el
// wordmark "CURVA", sin isotipo). Opcional: incluir el monto a pagar de un proyecto.
export default function FichaBanco() {
  const [banco, setBanco] = useState<DatosBancarios>(BANCO_FALLBACK);
  const [proj, setProj] = useState<Proyecto | null>(null);
  const [ready, setReady] = useState(false);
  const [incTotal, setIncTotal] = useState(false);
  const [incPend, setIncPend] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s?.banco) setBanco({ ...BANCO_FALLBACK, ...s.banco });
      const pid = new URLSearchParams(window.location.search).get("proyecto");
      if (pid && s?.projects) {
        const p = (s.projects as Proyecto[]).find((x) => x.id === pid) || null;
        setProj(p);
        if (p) setIncTotal(true); // si viene de un proyecto, por defecto muestra el total
      }
    } catch { /* noop */ }
    setReady(true);
  }, []);

  const total = useMemo(() => (proj ? totalCliente(proj) : 0), [proj]);
  const cobrado = useMemo(() => (proj?.pagos || []).reduce((a, x) => a + (+x.monto || 0), 0) * (proj?.conIVA ? 1.16 : 1), [proj]);
  const pendiente = Math.max(0, total - cobrado);

  useEffect(() => {
    if (ready) { const t = setTimeout(() => window.print(), 500); return () => clearTimeout(t); }
  }, [ready]);

  if (!ready) return <div className="pdf-page">Cargando…</div>;

  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const filas: [string, string][] = [
    ["Banco", banco.banco],
    ["Titular", banco.titular],
    ["No. de cuenta", banco.cuenta],
    ["CLABE interbancaria", banco.clabe],
    ["Código SWIFT / BIC", banco.swift],
  ].filter(([, v]) => v && v.trim()) as [string, string][];

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <button className="btn" onClick={() => window.close()}>Cerrar</button>
        {proj && (
          <>
            <label className="pdf-toggle"><input type="checkbox" checked={incTotal} onChange={(e) => setIncTotal(e.target.checked)} /> Incluir total</label>
            <label className="pdf-toggle"><input type="checkbox" checked={incPend} onChange={(e) => setIncPend(e.target.checked)} /> Incluir pendiente</label>
          </>
        )}
        <button className="btn primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>

      <div className="pdf-sheet">
        <div className="pdf-hero bank">
          <div className="pdf-word">CURVA</div>
          <h1>Datos para transferencia</h1>
          <div className="pdf-sub">{proj ? `${proj.nombre}${proj.clienteNombre ? ` · ${proj.clienteNombre}` : ""}` : "Ficha de cobro"}</div>
        </div>
        <div className="pdf-body">
          {(incTotal || incPend) && proj && (
            <div className="bank-amt">
              {incTotal && <div className="bank-amt-row"><span>Total a pagar</span><b>{fmtMXN(total)}</b></div>}
              {incPend && <div className="bank-amt-row pend"><span>Pendiente por pagar</span><b>{fmtMXN(pendiente)}</b></div>}
            </div>
          )}

          <div className="bank-fields">
            {filas.map(([l, v]) => (
              <div key={l} className="bank-f">
                <span className="bank-fl">{l}</span>
                <span className="bank-fv">{v}</span>
              </div>
            ))}
          </div>

          {banco.producto && <div className="pdf-foot" style={{ marginTop: 18 }}>Cuenta: {banco.producto}.</div>}
          <div className="pdf-foot">
            Puedes transferir por SPEI usando la CLABE. Al concluir, envíanos tu comprobante.<br />
            <b>CURVA</b> · {fecha}
          </div>
        </div>
      </div>
    </div>
  );
}
