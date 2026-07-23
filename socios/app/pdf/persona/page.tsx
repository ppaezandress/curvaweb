"use client";
import { useEffect, useMemo, useState } from "react";
import {
  fmtMXN, REGLAS_DEFAULT, reglasDe, membersResolved, repartoPorMes,
  addMonths, todayISO, mesLabel, pctFmt,
  type Proyecto, type Reglas, type Quien, type RosterPerson,
} from "@/lib/reparto";

const KEY = "curva_socios_v1";
type ProjAgg = { v: number; rol: string; ini: string; fin: string };
type Agg = {
  nombre: string; quien: Quien; total: number; neto: number;
  trabajo: number; extra: number; comision: number;
  byProject: Record<string, ProjAgg>; byMonth: Record<string, number>;
};
const rolTxt: Record<Quien, string> = { socioA: "Socio", socioB: "Socio", nucleo: "Núcleo", nuevo: "Colaborador" };
const esSoc = (q: Quien) => q === "socioA" || q === "socioB";
// Monto compacto para las etiquetas de la gráfica ($12.5k, $980).
const short = (n: number) => (n >= 10000 ? "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : fmtMXN(Math.round(n)));

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
          const a = (agg[k] = agg[k] || { nombre: pe.nombre, quien: pe.quien, total: 0, neto: 0, trabajo: 0, extra: 0, comision: 0, byProject: {}, byMonth: {} });
          a.total += bruto; a.neto += pe.neto;
          a.trabajo += pe.trabajo; a.extra += pe.extra; a.comision += pe.comision;
          a.byMonth[ym] = (a.byMonth[ym] || 0) + bruto;
          const pr = (a.byProject[p.nombre] = a.byProject[p.nombre] || { v: 0, rol: pe.roles[0] || "", ini: ym, fin: ym });
          pr.v += bruto;
          if (ym < pr.ini) pr.ini = ym;
          if (ym > pr.fin) pr.fin = ym;
        });
      });
    });
    return Object.values(agg)
      .filter((a) => !persona || a.nombre === persona)
      .sort((a, b) => b.total - a.total);
  }, [state, persona]);

  // Nombre del PDF = título de la pestaña. Efecto dedicado con dep de string estable y
  // SIN restaurar, para que ningún re-render lo revierta a "CURVA Socios".
  const tituloPDF = rows.length ? `${persona || (rows.length === 1 ? rows[0].nombre : "Reporte del equipo")} · reporte mensual` : "";
  useEffect(() => { if (tituloPDF) document.title = tituloPDF; }, [tituloPDF]);

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
        const proyectos = Object.entries(a.byProject).sort((x, y) => y[1].v - x[1].v);
        const esteMes = a.byMonth[curYM] || 0;
        const prom = meses.length ? a.total / meses.length : 0;
        const futuros = meses.filter((m) => m > curYM);
        const futuroTot = futuros.reduce((s, m) => s + a.byMonth[m], 0);
        const finProy = meses.length ? meses[meses.length - 1] : curYM;
        const rol = rolTxt[a.quien];
        const netoPct = `${P.imp || 0}%`;
        const comp = [
          { l: "Tu trabajo", v: a.trabajo, c: "var(--cobalt)" },
          { l: esSoc(a.quien) ? "Utilidad de socio" : "Bono del Núcleo", v: a.extra, c: "var(--c-banca)" },
          { l: "Comisión", v: a.comision, c: "#e8833a" },
        ].filter((x) => x.v > 0.5);
        const compTot = comp.reduce((s, x) => s + x.v, 0) || 1;
        const promH = Math.max(4, prom / maxMes * 100);
        return (
          <div className="pdf-sheet" key={i}>
            <div className="pdf-hero">
              <div className="pdf-logo"><Logo /> CURVA</div>
              <h1>{a.nombre}</h1>
              <div className="pdf-sub">Tu reporte mensual · {mesLabel(curYM)}</div>
            </div>
            <div className="pdf-body">
              <span className="pdf-role">{a.byProject[proyectos[0]?.[0]]?.rol || rol}</span>

              {/* Lo que ganas este mes */}
              <div className="pdf-amount">{fmtMXN(esteMes)}<span className="pdf-cur">este mes</span></div>
              <div className="pdf-foot" style={{ marginTop: 0, marginBottom: 18 }}>Lo que ganas en {mesLabel(curYM)} sumando todos tus proyectos.</div>

              {/* 3 números clave */}
              <div className="pmr-stats">
                <div className="pmr-stat"><span className="pmr-stat-l">Promedio al mes</span><b>{fmtMXN(prom)}</b></div>
                <div className="pmr-stat"><span className="pmr-stat-l">Por venir ({futuros.length} {futuros.length === 1 ? "mes" : "meses"})</span><b style={{ color: "var(--cobalt)" }}>{fmtMXN(futuroTot)}</b></div>
                <div className="pmr-stat"><span className="pmr-stat-l">Neto est. · ISR {netoPct}</span><b style={{ color: "var(--pos)" }}>{fmtMXN(a.neto)}</b></div>
              </div>

              {/* Línea de tiempo mes a mes */}
              <h3 className="pdf-h3">Tu trabajo mes a mes</h3>
              <div className="pmr-chart">
                <div className="pmr-avg" style={{ bottom: `calc(${promH}% + 26px)` }}><span>prom {short(prom)}</span></div>
                {meses.map((m) => {
                  const v = a.byMonth[m];
                  const estado = m < curYM ? "pas" : m === curYM ? "hoy" : "fut";
                  return (
                    <div className={"pmr-col " + estado} key={m}>
                      <div className="pmr-val">{short(v)}</div>
                      <div className="pmr-bar" style={{ height: `${Math.max(4, v / maxMes * 100)}%` }} />
                      <div className="pmr-lbl">{mesLabel(m).replace(" ", " ")}{m === curYM ? " ·hoy" : ""}</div>
                    </div>
                  );
                })}
              </div>
              <div className="pmr-leg">
                <span><i className="pmr-dot pas" />meses pasados</span>
                <span><i className="pmr-dot hoy" />este mes</span>
                <span><i className="pmr-dot fut" />por venir</span>
              </div>

              {/* De qué se compone */}
              <h3 className="pdf-h3">De qué se compone tu pago</h3>
              <div className="pmr-stack">
                {comp.map((x) => <div key={x.l} style={{ flex: x.v, background: x.c }} title={`${x.l} ${fmtMXN(x.v)}`} />)}
              </div>
              <div className="pmr-comp-leg">
                {comp.map((x) => <span key={x.l}><i className="pmr-dot" style={{ background: x.c }} />{x.l} <b>{pctFmt(x.v / compTot)}</b> · {fmtMXN(x.v)}</span>)}
              </div>

              {/* Tus proyectos con su gorra */}
              <h3 className="pdf-h3">Tus proyectos</h3>
              {proyectos.map(([name, pr]) => {
                const nMeses = meses.filter((m) => m >= pr.ini && m <= pr.fin).length;
                return (
                  <div className="pmr-proj" key={name}>
                    <div className="pmr-proj-l">
                      <span className="pmr-gorra">{pr.rol || rol}</span>
                      <div className="pmr-proj-n"><b>{name}</b><span>{nMeses > 1 ? `${nMeses} meses · termina ${mesLabel(pr.fin)}` : `1 mes · ${mesLabel(pr.ini)}`}</span></div>
                    </div>
                    <div className="pmr-proj-v"><b>{fmtMXN(pr.v / (nMeses || 1))}</b><span>/mes</span></div>
                  </div>
                );
              })}

              {/* Cierre / futuro */}
              <div className="pmr-outlook">
                {futuros.length > 0
                  ? <>En los próximos <b>{futuros.length} {futuros.length === 1 ? "mes" : "meses"}</b> vas a ganar <b>{fmtMXN(futuroTot)}</b> más. Tu trabajo con CURVA llega hasta <b>{mesLabel(finProy)}</b>.</>
                  : <>Este mes cierras tus proyectos actuales. Vienen más 🚀</>}
              </div>

              <div className="pdf-foot">
                Montos brutos (antes de ISR), proyectados con el plazo de cada proyecto (Método A).<br />
                Se liberan conforme entran los pagos del cliente. <b>CURVA</b> · {fecha}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
