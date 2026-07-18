"use client";
import { useEffect, useMemo, useState } from "react";
import {
  fmtMXN, REGLAS_DEFAULT, reglasDe, membersResolved, repartoPorMes,
  addMonths, todayISO, mesLabel, pctFmt,
  type Proyecto, type Reglas, type Quien, type RosterPerson,
} from "@/lib/reparto";

const KEY = "curva_socios_v1";
type Agg = { nombre: string; quien: Quien; total: number; neto: number; byProject: Record<string, number>; byMonth: Record<string, number> };
const rolTxt: Record<Quien, string> = { socioA: "Socio", socioB: "Socio", nucleo: "Núcleo", nuevo: "Colaborador" };

const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M2 19 C7 19 8 15 12 10 C15 6 18 4 22 4" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" /><circle cx={22} cy={4} r={2} fill="currentColor" /></svg>
);

export default function PdfPersona() {
  const [state, setState] = useState<{ params: Reglas; projects: Proyecto[]; roster: RosterPerson[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [persona, setPersona] = useState<string | null>(null); // ?persona= → una sola hoja

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light"); // el PDF siempre en claro
    try {
      const sp = new URLSearchParams(window.location.search);
      setPersona(sp.get("persona"));
    } catch { /* noop */ }
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s?.projects) {
        setState({ params: { ...REGLAS_DEFAULT, ...(s.params || {}) }, projects: s.projects, roster: s.roster || [] });
      }
    } catch { /* noop */ }
    setReady(true);
  }, []);

  // Agregación por persona cross-proyecto — MISMA lógica que la vista "Personas":
  // reglasDe (foto congelada), membersResolved (roster vivo), repartoPorMes (Método A).
  const rows = useMemo<Agg[]>(() => {
    if (!state) return [];
    const P = state.params;
    const vivos = state.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);
    const agg: Record<string, Agg> = {};
    vivos.forEach((p) => {
      const R = reglasDe(p, P);
      const rm = repartoPorMes(membersResolved(p, state.roster, R), R);
      const inicio = p.fechaInicio || todayISO();
      rm.forEach((mm) => {
        const ym = addMonths(inicio, mm.mes - 1);
        Object.values(mm.personas).forEach((pe) => {
          const bruto = pe.trabajo + pe.extra + pe.comision;
          if (bruto <= 0.5) return;
          const k = pe.nombre + "|" + pe.quien;
          const a = (agg[k] = agg[k] || { nombre: pe.nombre, quien: pe.quien, total: 0, neto: 0, byProject: {}, byMonth: {} });
          a.total += bruto; a.neto += pe.neto;
          a.byProject[p.nombre] = (a.byProject[p.nombre] || 0) + bruto;
          a.byMonth[ym] = (a.byMonth[ym] || 0) + bruto;
        });
      });
    });
    return Object.values(agg)
      .filter((a) => !persona || a.nombre === persona)
      .sort((a, b) => b.total - a.total);
  }, [state, persona]);

  useEffect(() => {
    if (ready && rows.length) {
      const t = setTimeout(() => window.print(), 600); // deja cargar fuentes
      return () => clearTimeout(t);
    }
  }, [ready, rows]);

  if (!ready) return <div className="pdf-page">Cargando…</div>;
  if (!rows.length) return <div className="pdf-page">No hay reparto por persona todavía. Guarda proyectos en la app y vuelve a generar el PDF.</div>;

  const P = state!.params;
  const curYM = todayISO().slice(0, 7);
  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <button className="btn" onClick={() => window.close()}>Cerrar</button>
        <button className="btn primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>

      {rows.map((a, i) => {
        const meses = Object.keys(a.byMonth).sort();
        const maxMes = Math.max(1, ...meses.map((m) => a.byMonth[m]));
        const proyectos = Object.entries(a.byProject).sort((x, y) => y[1] - x[1]);
        const esteMes = a.byMonth[curYM] || 0;
        const prom = meses.length ? a.total / meses.length : 0;
        const rol = rolTxt[a.quien];
        return (
          <div className="pdf-sheet" key={i}>
            <div className="pdf-hero">
              <div className="pdf-logo"><Logo /> CURVA</div>
              <h1>{a.nombre}</h1>
              <div className="pdf-sub">Reparto por persona · todos los proyectos vivos</div>
            </div>
            <div className="pdf-body">
              <span className="pdf-role">{rol}</span>

              {/* Tarjeta grande: lo que genera ESTE mes */}
              <div className="pdf-amount">{fmtMXN(esteMes)}<span className="pdf-cur">este mes · {mesLabel(curYM)}</span></div>
              <div className="pdf-foot" style={{ marginTop: 0, marginBottom: 20 }}>Lo que generas en el mes actual sumando todos tus proyectos (proyectado, Método A).</div>

              {/* Gráfica de estabilidad: barra por mes */}
              <h3 className="pdf-h3">Tu estabilidad mes a mes</h3>
              <div className="pdf-chart">
                {meses.map((m) => (
                  <div className="pdf-bar-col" key={m}>
                    <div className="pdf-bar-val">{fmtMXN(a.byMonth[m])}</div>
                    <div className="pdf-bar" style={{ height: Math.max(4, a.byMonth[m] / maxMes * 96) }} />
                    <div className="pdf-bar-lbl">{mesLabel(m)}</div>
                  </div>
                ))}
              </div>

              {/* Desglose por proyecto */}
              <h3 className="pdf-h3">Por proyecto</h3>
              {proyectos.map(([name, v]) => (
                <div className="pdf-line" key={name}><span className="pl">{name}</span><span className="pv">{fmtMXN(v)}</span></div>
              ))}

              {/* Totales */}
              <div className="pdf-line" style={{ marginTop: 6 }}><span className="pl">Promedio por mes</span><span className="pv">{fmtMXN(prom)}</span></div>
              <div className="pdf-line"><span className="pl"><b>Total (todos los proyectos)</b></span><span className="pv"><b>{fmtMXN(a.total)}</b></span></div>
              <div className="pdf-line"><span className="pl">Neto estimado · después de ISR ({pctFmt((P.imp || 0) / 100)})</span><span className="pv">{fmtMXN(a.neto)}</span></div>

              <div className="pdf-foot">
                Montos brutos (antes de ISR), proyectados con el plazo de cada proyecto (Método A).<br />
                Se liberan conforme entran los pagos del cliente.<br />
                <b>CURVA</b> · {fecha}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
