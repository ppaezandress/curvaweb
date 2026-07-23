"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { compute, fmtMXN, totalCliente, isrReservaDe, REGLAS_DEFAULT, type Proyecto, type Reglas, type Quien } from "@/lib/reparto";

const KEY = "curva_socios_v1";
type RosterPerson = { id: string; nombre: string; quien: Quien };
// Resuelve nombre/tipo de cada miembro desde el roster (misma lógica que la app).
function resolveMembers(pr: Proyecto, roster: RosterPerson[], P: Reglas): Proyecto {
  const byId = new Map(roster.map((r) => [r.id, r]));
  const members = pr.members.map((m) => {
    if (m.personId === "socioA") return { ...m, quien: "socioA" as Quien, nombre: P.nombreA, sm: 1 };
    if (m.personId === "socioB") return { ...m, quien: "socioB" as Quien, nombre: P.nombreB, sm: 1 };
    const rp = m.personId ? byId.get(m.personId) : undefined;
    if (rp) return { ...m, quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1 };
    return m;
  });
  return { ...pr, members };
}
const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M2 19 C7 19 8 15 12 10 C15 6 18 4 22 4" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" /><circle cx={22} cy={4} r={2} fill="currentColor" /></svg>
);

export default function PdfReparto() {
  const { projectId } = useParams<{ projectId: string }>();
  const [proj, setProj] = useState<Proyecto | null>(null);
  const [params, setParams] = useState<Reglas>(REGLAS_DEFAULT);
  const [ready, setReady] = useState(false);
  const [showComis, setShowComis] = useState(true); // ¿mostrar la comisión en el PDF?
  const [persona, setPersona] = useState<string | null>(null); // ?persona= → una sola hoja
  const [parte, setParte] = useState<string | null>(null);     // ?parte=comision|pago → solo esa parte

  useEffect(() => {
    // El PDF sale siempre en claro, sin importar el tema de la app.
    document.documentElement.setAttribute("data-theme", "light");
    try {
      const sp = new URLSearchParams(window.location.search);
      setPersona(sp.get("persona"));
      setParte(sp.get("parte"));
    } catch { /* noop */ }
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s?.projects) {
        const P = { ...REGLAS_DEFAULT, ...(s.params || {}) };
        const raw = s.projects.find((x: Proyecto) => x.id === projectId) || null;
        // El PDF respeta la foto de Reglas congelada del proyecto (mismo criterio que
        // la app): dinero de SU foto, nombres vivos. Sin foto (borrador/viejo) usa las
        // Reglas vivas. Así el PDF cuadra con lo que muestra la app aunque muevas perillas.
        const Reff: Reglas = raw && !raw.borrador && raw.reglas
          ? { ...raw.reglas, nombreA: P.nombreA, nombreB: P.nombreB } : P;
        setProj(raw ? resolveMembers(raw, s.roster || [], Reff) : null);
        setParams(Reff);
      }
    } catch { /* noop */ }
    setReady(true);
  }, [projectId]);

  const r = useMemo(() => (proj ? compute(proj, params) : null), [proj, params]);

  // Nombre del PDF (título de la pestaña): persona · proyecto (o "Reparto · proyecto"
  // para la hoja de todos). Efecto dedicado, dep de string estable y SIN restaurar, para
  // que ningún re-render lo revierta a "CURVA Socios". Decisión Andrés 2026-07-23.
  const tituloPDF = proj ? `${persona || (parte === "comision" ? "Comisión" : "Reparto")} · ${proj.nombre}` : "";
  useEffect(() => { if (tituloPDF) document.title = tituloPDF; }, [tituloPDF]);

  useEffect(() => {
    if (ready && proj && r) {
      const t = setTimeout(() => window.print(), 600); // deja cargar fuentes
      return () => clearTimeout(t);
    }
  }, [ready, proj, r]);

  if (!ready) return <div className="pdf-page">Cargando…</div>;
  if (!proj || !r) return <div className="pdf-page">No encontré ese proyecto. Ábrelo desde la app y vuelve a generar el PDF.</div>;

  const soloComis = parte === "comision"; // PDF solo de la comisión
  const soloPago = parte === "pago";      // PDF solo del pago (sin comisión)
  // ISR de CURVA (RESICO): sale de la utilidad de los SOCIOS (no del sueldo del Núcleo).
  // Se lo restamos a cada socio para que el PDF cuadre EXACTO con lo que reparte el pago
  // y con lo que muestra la app (que ya van netos). Decisión Andrés 2026-07-23.
  const isrRes = proj.descontarISR && params.imp > 0 ? isrReservaDe(r.t, params) : 0;
  const isrDe = (q: Quien) => q === "socioA" ? isrRes * params.split / 100 : q === "socioB" ? isrRes * (1 - params.split / 100) : 0;
  const cm = (a: { comision?: number }) => (soloPago ? 0 : soloComis ? (a.comision || 0) : showComis ? a.comision || 0 : 0);
  const extraOf = (a: { quien: Quien; extra: number }) => Math.max(0, a.extra - isrDe(a.quien)); // utilidad de socio ya sin ISR
  const baseOf = (a: { quien: Quien; trabajo: number; extra: number }) => (soloComis ? 0 : a.trabajo + extraOf(a));
  const gente = Object.values(r.people)
    .filter((a) => baseOf(a) + cm(a) > 0.5)
    .filter((a) => !persona || a.nombre === persona) // ?persona= → solo esa hoja
    .sort((a, b) => (baseOf(b) + cm(b)) - (baseOf(a) + cm(a)));
  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const hayComis = Object.values(r.people).some((a) => (a.comision || 0) > 0.5);
  const plazoN = Math.max(1, Math.floor(proj.plazoMeses || 1)); // para mostrar el reparto al mes
  // En proyectos a varios meses: mostrar el MENSUAL como número principal (no el total
  // de los N meses) y decir "durante N meses". Decisión Andrés 2026-07-23.
  const multiMes = plazoN > 1;
  const fMes = multiMes ? 1 / plazoN : 1;

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <button className="btn" onClick={() => window.close()}>Cerrar</button>
        {hayComis && !parte && (
          <label className="pdf-toggle" title="Si lo apagas, el PDF no menciona ni suma la comisión (por si quieres darla como incentivo después).">
            <input type="checkbox" checked={showComis} onChange={(e) => setShowComis(e.target.checked)} />
            Mostrar comisión
          </label>
        )}
        <button className="btn primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>

      {gente.map((a, i) => {
        const comis = cm(a);
        const base = baseOf(a);
        const tot = base + comis;
        const esSocio = a.quien === "socioA" || a.quien === "socioB";
        const rol = a.roles.filter((x) => x !== "—" && x !== "comisión").join(" · ") || (esSocio ? "Socio" : "Colaborador");
        return (
          <div className="pdf-sheet" key={i}>
            <div className="pdf-hero">
              <div className="pdf-logo"><Logo /> CURVA</div>
              <h1>{a.nombre}</h1>
              <div className="pdf-sub">{proj.nombre}{proj.clienteNombre ? ` · ${proj.clienteNombre}` : ""}{soloComis ? " · Comisión" : soloPago ? " · Pago" : ""}</div>
            </div>
            <div className="pdf-body">
              <span className="pdf-role">{soloComis ? "Comisión por traer el cliente" : rol}</span>
              <div className="pdf-amount">{fmtMXN(tot * fMes)}<span className="pdf-cur">MXN{multiMes ? " / mes" : ""}</span></div>
              {multiMes && <div className="pdf-permes">cada mes · durante <b>{plazoN} meses</b></div>}
              <div className="pdf-foot" style={{ marginTop: 0, marginBottom: 22 }}>{soloComis ? "Tu comisión por traer este cliente." : soloPago ? "Tu pago por el trabajo en este proyecto." : multiMes ? `Lo que ganas cada mes en este proyecto, durante ${plazoN} meses.` : "Lo que ganas en este proyecto."}</div>

              {base > 0.5 && a.trabajo > 0.5 && <div className="pdf-line"><span className="pl">Por tu trabajo ({rol}){multiMes ? " · al mes" : ""}</span><span className="pv">{fmtMXN(a.trabajo * fMes)}</span></div>}
              {base > 0.5 && extraOf(a) > 0.5 && <div className="pdf-line"><span className="pl">{esSocio ? `Utilidad de socio${isrRes > 0.5 ? " · ya sin ISR" : ""}` : "Bono del Núcleo"}{multiMes ? " · al mes" : ""}</span><span className="pv">{fmtMXN(extraOf(a) * fMes)}</span></div>}
              {comis > 0.5 && <div className="pdf-line"><span className="pl">Comisión por traer el cliente{multiMes ? " · al mes" : ""}</span><span className="pv">{fmtMXN(comis * fMes)}</span></div>}
              <div className="pdf-line"><span className="pl"><b>Total{multiMes ? " al mes" : ""}</b></span><span className="pv"><b>{fmtMXN(tot * fMes)}</b></span></div>

              <div className="pdf-foot">
                Proyecto de {proj.plazoMeses ?? 1} mes{(proj.plazoMeses ?? 1) !== 1 ? "es" : ""} · cobro {(proj.modoCobro ?? "golpe") === "mensual" ? "mensual" : "de golpe"}{esSocio ? ` · valor ${fmtMXN(r.t)}${proj.conIVA ? ` (+ IVA = ${fmtMXN(totalCliente(proj))})` : ""}` : ""}.<br />
                {esSocio ? (isrRes > 0.5 ? "Tu utilidad ya trae descontado el ISR de CURVA (RESICO). " : "") : "Monto bruto (tu ISR personal va por tu cuenta). "}Se libera conforme entran los pagos del cliente.<br />
                <b>CURVA</b> · {fecha}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
