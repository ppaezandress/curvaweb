"use client";
import { useEffect, useState, useCallback, useRef, Fragment, type CSSProperties } from "react";
import {
  LayoutDashboard, Calculator, FolderKanban, Receipt, SlidersHorizontal, UploadCloud, Check,
  FileText, Plus, ChevronDown, ChevronRight, ArrowRight, Wallet, Info, RotateCcw, AlertTriangle, Trash2,
  Scale, CalendarRange,
} from "lucide-react";
import {
  compute, fmtMXN, pctFmt, metaBanca, totalCliente, pctRecibido, desembolso, desembolsoDePago, agrupaCajas,
  cajaLabel, CAJA_ORDER, isSocio,
  repartoPorMes, ticketSinIVA,
  REGLAS_DEFAULT, IVA, ROLNAME, type Proyecto, type Reglas, type Miembro, type Quien, type Pago, type ReparteMes,
  type EstadoProyecto, type Rol, type CajaKind, type CajaGrupo, type DatosBancarios,
} from "@/lib/reparto";

type Gasto = { n: string; m: number; proyectoId?: string | null; proveedor?: string; fecha?: string | null; esIngreso?: boolean };
type Cliente = { id: string; nombre: string; estado: string | null };
// Directorio del equipo: defines a cada persona UNA vez (nombre + qué es) y la
// reutilizas en cualquier proyecto. Los socios A/B no viven aquí: son fijos y su
// nombre sale de Reglas (nombreA/nombreB), así nunca se desincroniza.
type RosterPerson = { id: string; nombre: string; quien: Quien };
type State = { params: Reglas; gastos: Gasto[]; projects: Proyecto[]; roster: RosterPerson[]; activeId: string; rulesVersion?: number; saldosIniciales?: Record<CajaKind, number>; banco?: DatosBancarios };
const RULES_VERSION = 7; // sube esto cuando una decisión deba re-aplicarse a estados guardados
// Saldo que YA existía en cada caja de Revolut antes de que la app empezara a
// contar (el socio lo captura una vez; se SUMA a lo que la app calcula).
const DEF_SALDOS: Record<CajaKind, number> = { masaSalarial: 0, socioA: 0, socioB: 0, cajaProyecto: 0, cajaAhorro: 0, banca: 0 };
const mergeSaldos = (x: unknown): Record<CajaKind, number> => ({ ...DEF_SALDOS, ...((x as Record<CajaKind, number>) || {}) });
// Datos de cobro de CURVA (editable en Panel). Pre-cargado con la cuenta de Andrés.
const DEF_BANCO: DatosBancarios = {
  banco: "BBVA", producto: "Libretón Básico Cuenta Digital", titular: "Andrés Gabino Páez Cortázar",
  cuenta: "157 840 5420", clabe: "012 180 01578405420 4", swift: "BCMRMXMMPYM",
};
const mergeBanco = (x: unknown): DatosBancarios => ({ ...DEF_BANCO, ...((x as DatosBancarios) || {}) });
const DEF_ROSTER: RosterPerson[] = [
  { id: "r_ivana", nombre: "Ivana", quien: "nucleo" },
  { id: "r_lomba", nombre: "Lomba", quien: "nucleo" },
  { id: "r_yannick", nombre: "Yannick", quien: "nucleo" },
  { id: "r_diana", nombre: "Diana", quien: "nucleo" },
];

const KEY = "curva_socios_v1";
const uid = () => "p" + Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
// Aritmética de meses sobre "YYYY-MM-DD" → "YYYY-MM" (sin líos de zona horaria).
const addMonths = (iso: string, k: number) => {
  const [y, m] = iso.split("-").map(Number);
  const idx = y * 12 + (m - 1) + k;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
};
const MES_ABR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MES_ABR[m - 1]} ${String(y).slice(2)}`; };
// Color por caja de destino en las tarjetas de desembolso.
// Color de cada caja de Revolut (dot en las tarjetas de cajas / tesorería).
const cajaKindColor: Record<CajaKind, string> = {
  masaSalarial: "--c-equipo", socioA: "--c-andres", socioB: "--c-balmo",
  cajaProyecto: "--c-caja", cajaAhorro: "--c-banca", banca: "--c-reserva",
};
const ESTADO_LABEL: Record<EstadoProyecto, string> = {
  cotizacion: "Cotización", activo: "Activo", cerrado: "Cerrado", cancelado: "Cancelado",
};
const roleColor: Record<Quien, string> = { socioA: "--c-andres", socioB: "--c-balmo", nucleo: "--c-banca", nuevo: "--muted" };
const badgeCls: Record<Quien, string> = { socioA: "b-socio", socioB: "b-socio", nucleo: "b-nucleo", nuevo: "b-nuevo" };
const badgeTxt: Record<Quien, string> = { socioA: "socio", socioB: "socio", nucleo: "núcleo", nuevo: "nuevo" };
const order: Record<Quien, number> = { socioA: 0, socioB: 1, nucleo: 2, nuevo: 3 };
const cajaPreset = { trazo: 10, trayectoria: 8, alianza: 15 } as const;
const DEF_GASTOS: Gasto[] = [
  { n: "ChatGPT", m: 360 }, { n: "Claude Max", m: 1800 }, { n: "Claude", m: 360 }, { n: "Notion", m: 400 }, { n: "Contadora", m: 800 },
];

// Resuelve la identidad de cada miembro desde el roster (fuente de verdad):
// nombre y tipo (núcleo/socio/nuevo) salen del directorio, no de una copia vieja.
// Así renombrar a alguien en Reglas se refleja en TODOS los proyectos al instante.
function membersResolved(pr: Proyecto, roster: RosterPerson[], P: Reglas): Proyecto {
  const byId = new Map(roster.map((r) => [r.id, r]));
  const resolve = (m: Miembro): Miembro => {
    if (m.personId === "socioA") return { ...m, quien: "socioA" as Quien, nombre: P.nombreA, sm: 1 };
    if (m.personId === "socioB") return { ...m, quien: "socioB" as Quien, nombre: P.nombreB, sm: 1 };
    const rp = m.personId ? byId.get(m.personId) : undefined;
    if (rp) return { ...m, quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1 };
    return m; // legacy sin personId: usa lo guardado
  };
  const members = pr.members.map(resolve);
  let agenda = pr.agenda;
  if (agenda) {
    const a2: Record<number, Miembro[]> = {};
    for (const k of Object.keys(agenda)) a2[+k] = agenda[+k].map(resolve);
    agenda = a2;
  }
  return agenda ? { ...pr, members, agenda } : { ...pr, members };
}

// Reglas con las que se calcula un proyecto. Un proyecto GUARDADO con foto propia
// (pr.reglas) se calcula con ESA foto — mover perillas en Reglas ya no lo toca. Los
// NOMBRES sí se toman de las Reglas vivas (renombrar un socio se refleja en todos).
// Borradores y proyectos sin foto usan las Reglas vivas (params).
function reglasDe(pr: Proyecto, params: Reglas): Reglas {
  if (pr.borrador || !pr.reglas) return params;
  return { ...pr.reglas, nombreA: params.nombreA, nombreB: params.nombreB };
}

// Aplica las migraciones de campos nuevos a un proyecto (server o local viejo).
function migrateProject(p: Proyecto): Proyecto {
  return {
    ...p,
    plazoMeses: p.plazoMeses ?? 1,
    modoCobro: p.modoCobro ?? "golpe",
    conIVA: p.conIVA ?? false,
    estado: p.estado ?? "cotizacion",
    fechaInicio: p.fechaInicio ?? todayISO(),
    pagos: p.pagos ?? [],
    equipoPagado: p.equipoPagado ?? {},
  };
}

// Congela con el MODELO CANÓNICO (defaults de CURVA) los proyectos guardados que aún
// no tienen su foto de Reglas (pre-v7, tanto local como del server). Idempotente: si
// ya tienen foto no los toca; los borradores nunca se congelan. Así "mover perillas en
// Reglas" deja de recalcular proyectos viejos (bug reportado por Balmo).
const freezeLegacyReglas = (projects: Proyecto[]): Proyecto[] =>
  projects.map((p) => (p.borrador || p.reglas) ? p : { ...p, reglas: { ...REGLAS_DEFAULT } });

// Fotografía del estado para diffear qué cambió antes de sincronizar.
type Snapshot = { projects: Record<string, string>; params: string; gastos: string; roster: string; rulesVersion: number; saldos: string; banco: string };
function snapshotOf(s: State): Snapshot {
  const projects: Record<string, string> = {};
  s.projects.filter((p) => !p.borrador).forEach((p) => { projects[p.id] = JSON.stringify(p); });
  return { projects, params: JSON.stringify(s.params), gastos: JSON.stringify(s.gastos), roster: JSON.stringify(s.roster || []), rulesVersion: s.rulesVersion || RULES_VERSION, saldos: JSON.stringify(mergeSaldos(s.saldosIniciales)), banco: JSON.stringify(mergeBanco(s.banco)) };
}
function hayPendientes(s: State, snap: Snapshot): boolean {
  const cur = snapshotOf(s);
  if (cur.params !== snap.params || cur.gastos !== snap.gastos || cur.roster !== snap.roster || cur.rulesVersion !== snap.rulesVersion || cur.saldos !== snap.saldos || cur.banco !== snap.banco) return true;
  const ids = new Set([...Object.keys(cur.projects), ...Object.keys(snap.projects)]);
  for (const id of ids) if (cur.projects[id] !== snap.projects[id]) return true;
  return false;
}

function newProject(name: string): Proyecto {
  return {
    id: uid(), nombre: name, ticket: 80000, tipo: "trazo", cajaPct: 10, comisOn: true, comisWho: "banca", origen: "empresa", inMonth: true,
    members: [{ rol: "P", quien: "socioA", nombre: "Andrés", sm: 1, personId: "socioA" }, { rol: "E", quien: "nucleo", nombre: "Ivana", sm: 1, personId: "r_ivana" }],
    plazoMeses: 1, modoCobro: "golpe", conIVA: false, estado: "cotizacion", fechaInicio: todayISO(), pagos: [],
  };
}
// Nombre y borrador nuevo para el "formulario" de la Calculadora.
const nextProjName = (projects: Proyecto[]) => "Proyecto " + (projects.filter((p) => !p.borrador).length + 1);
const makeDraft = (projects: Proyecto[]): Proyecto => ({ ...newProject(nextProjName(projects)), borrador: true });

function initialState(): State {
  const p1 = newProject("Wellness (ejemplo)");
  const p2 = newProject("Web Trazo (ejemplo)");
  p2.ticket = 30000; p2.cajaPct = 8; p2.members = [{ rol: "P", quien: "nucleo", nombre: "Lomba", sm: 1, personId: "r_lomba" }];
  return { params: { ...REGLAS_DEFAULT }, gastos: DEF_GASTOS.slice(), projects: [p1, p2], roster: DEF_ROSTER.slice(), activeId: p1.id, rulesVersion: RULES_VERSION, saldosIniciales: { ...DEF_SALDOS }, banco: { ...DEF_BANCO } };
}

const NAV = [
  { k: "panel", label: "Panel", Icon: LayoutDashboard },
  { k: "calculadora", label: "Calculadora", Icon: Calculator },
  { k: "proyectos", label: "Proyectos", Icon: FolderKanban },
  { k: "mimes", label: "Mi mes", Icon: Scale },
  { k: "cajas", label: "Cajas", Icon: Wallet },
  { k: "facturas", label: "Facturas", Icon: Receipt },
  { k: "reglas", label: "Reglas", Icon: SlidersHorizontal },
] as const;

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [sec, setSec] = useState<string>("panel");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const cloudRef = useRef<boolean>(false);        // ¿Supabase disponible? (verdad compartida)
  const syncedRef = useRef<Snapshot | null>(null); // última foto que ya está en el server

  useEffect(() => {
    let s: State | null = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* noop */ }
    // Merge de parámetros: los guardados mandan, pero cualquier perilla NUEVA
    // (que antes estaba hardcodeada) toma su default. Así no rompemos localStorage viejo.
    if (s && s.projects) {
      const merged: State = { ...s, params: { ...REGLAS_DEFAULT, ...(s.params || {}) }, roster: (s.roster && s.roster.length ? s.roster : DEF_ROSTER.slice()), saldosIniciales: mergeSaldos(s.saldosIniciales), banco: mergeBanco(s.banco) };
      // Migraciones de decisiones (se re-aplican a estados guardados viejos):
      if ((s.rulesVersion || 0) < 2) { merged.params.pool = 0; }              // apagar bono del Núcleo
      if ((s.rulesVersion || 0) < 3) { merged.params.metaBancaMonto = 48000; } // meta de Banca realista
      if ((s.rulesVersion || 0) < 6) { merged.params.imp = 2.5; }               // ISR realista (RESICO), antes 30% placeholder
      if ((s.rulesVersion || 0) < 4) {                                        // control de pagos: campos nuevos
        merged.projects = merged.projects.map((p) => ({
          ...p,
          plazoMeses: p.plazoMeses ?? 1,
          modoCobro: p.modoCobro ?? "golpe",
          conIVA: p.conIVA ?? false,
          estado: p.estado ?? "cotizacion",
          fechaInicio: p.fechaInicio ?? todayISO(),
          pagos: p.pagos ?? [],
        }));
      }
      if ((s.rulesVersion || 0) < 7) merged.projects = freezeLegacyReglas(merged.projects); // congelar params por proyecto
      merged.rulesVersion = RULES_VERSION;
      setSt(merged);
    } else {
      setSt(initialState());
    }
  }, []);
  useEffect(() => { if (st) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* noop */ } }, [st]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    fetch("/api/clientes").then((r) => r.json()).then((d) => { if (d.ok) setClientes(d.clientes || []); }).catch(() => {});
  }, []);

  // ── Verdad compartida (Supabase). Al montar: si el server tiene datos, mandan;
  //    si está vacío, lo sembramos con lo que haya local. Si no está configurado,
  //    seguimos 100% en localStorage (modo offline). ──
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const d = await (await fetch("/api/state")).json();
        if (cancel) return;
        if (d.unconfigured || !d.ok) { cloudRef.current = false; return; }
        cloudRef.current = true;
        if (!d.empty && d.state) {
          const srv = d.state;
          const params: Reglas = { ...REGLAS_DEFAULT, ...(srv.params || {}) };
          const rv = srv.rulesVersion || 0;
          if (rv < 2) params.pool = 0;
          if (rv < 3) params.metaBancaMonto = 48000;
          if (rv < 6) params.imp = 2.5;   // ISR realista (RESICO), antes 30% placeholder
          let projects: Proyecto[] = (srv.projects || []);
          if (rv < 4) projects = projects.map(migrateProject);
          if (rv < 7) projects = freezeLegacyReglas(projects);   // congela guardados del server (verdad PROD)
          setSt((prev) => {
            const gastos = srv.gastos || prev?.gastos || DEF_GASTOS.slice();
            const roster = (srv.roster && srv.roster.length ? srv.roster : (prev?.roster || DEF_ROSTER.slice()));
            const drafts = (prev?.projects || []).filter((p) => p.borrador);   // el borrador es local, no viene del server
            const all = [...projects, ...drafts];
            const activeId = prev && all.some((p) => p.id === prev.activeId) ? prev.activeId : (all[0]?.id || "");
            const next: State = { params, gastos, projects: all, roster, activeId, rulesVersion: RULES_VERSION, saldosIniciales: mergeSaldos(srv.saldosIniciales ?? prev?.saldosIniciales), banco: mergeBanco(srv.banco ?? prev?.banco) };
            syncedRef.current = snapshotOf(next);
            return next;
          });
        } else {
          // server vacío → sembrar con el estado local actual
          setSt((prev) => {
            const base = prev || initialState();
            fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upsertProjects: base.projects, params: base.params, gastos: base.gastos, roster: base.roster, rulesVersion: base.rulesVersion, saldosIniciales: mergeSaldos(base.saldosIniciales), banco: mergeBanco(base.banco) }) }).catch(() => {});
            syncedRef.current = snapshotOf(base);
            return base;
          });
        }
      } catch { cloudRef.current = false; }
    })();
    return () => { cancel = true; };
  }, []);

  // Sync con diff por-proyecto (debounced). Solo sube lo que cambió.
  useEffect(() => {
    if (!st || !cloudRef.current || !syncedRef.current) return;
    const h = setTimeout(() => {
      const snap = syncedRef.current!;
      const cur = snapshotOf(st);
      const upsertProjects = st.projects.filter((p) => snap.projects[p.id] !== cur.projects[p.id]);
      const deleteIds = Object.keys(snap.projects).filter((id) => !cur.projects[id]);
      const body: Record<string, unknown> = {};
      if (upsertProjects.length) body.upsertProjects = upsertProjects;
      if (deleteIds.length) body.deleteIds = deleteIds;
      if (snap.params !== cur.params) body.params = st.params;
      if (snap.gastos !== cur.gastos) body.gastos = st.gastos;
      if (snap.roster !== cur.roster) body.roster = st.roster;
      if (snap.rulesVersion !== cur.rulesVersion) body.rulesVersion = st.rulesVersion;
      if (snap.saldos !== cur.saldos) body.saldosIniciales = mergeSaldos(st.saldosIniciales);
      if (snap.banco !== cur.banco) body.banco = mergeBanco(st.banco);
      if (Object.keys(body).length === 0) return;
      fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => r.json()).then((d) => { if (d.ok) syncedRef.current = cur; }).catch(() => {});
    }, 800);
    return () => clearTimeout(h);
  }, [st]);

  // Al volver a la pestaña, jala lo último del server — pero solo si NO hay cambios
  // locales sin subir (para no pisar una edición en curso).
  useEffect(() => {
    const onFocus = () => {
      if (!cloudRef.current) return;
      setSt((prev) => {
        if (prev && syncedRef.current && hayPendientes(prev, syncedRef.current)) return prev; // hay pendientes → no pisar
        fetch("/api/state").then((r) => r.json()).then((d) => {
          if (!d.ok || d.empty || !d.state) return;
          const srv = d.state;
          const params: Reglas = { ...REGLAS_DEFAULT, ...(srv.params || {}) };
          const projects: Proyecto[] = freezeLegacyReglas((srv.projects || []).map(migrateProject));
          setSt((curr) => {
            const gastos = srv.gastos || curr?.gastos || DEF_GASTOS.slice();
            const roster = (srv.roster && srv.roster.length ? srv.roster : (curr?.roster || DEF_ROSTER.slice()));
            const drafts = (curr?.projects || []).filter((p) => p.borrador);
            const all = [...projects, ...drafts];
            const activeId = curr && all.some((p) => p.id === curr.activeId) ? curr.activeId : (all[0]?.id || "");
            const next: State = { params, gastos, projects: all, roster, activeId, rulesVersion: RULES_VERSION, saldosIniciales: mergeSaldos(srv.saldosIniciales ?? curr?.saldosIniciales), banco: mergeBanco(srv.banco ?? curr?.banco) };
            syncedRef.current = snapshotOf(next);
            return next;
          });
        }).catch(() => {});
        return prev;
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!st) return <div style={{ padding: 40 }}>Cargando…</div>;

  const active = st.projects.find((p) => p.id === st.activeId) || st.projects[0];
  const overhead = st.gastos.reduce((s, g) => s + (+g.m || 0), 0);
  const update = (fn: (s: State) => State) => setSt((prev) => (prev ? fn(structuredClone(prev)) : prev));
  const updateActive = (fn: (p: Proyecto) => void) => update((s) => { const p = s.projects.find((x) => x.id === s.activeId); if (p) fn(p); return s; });

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M2 19 C7 19 8 15 12 10 C15 6 18 4 22 4" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" /><circle cx={22} cy={4} r={2} fill="currentColor" /></svg>
          <b>CURVA <span>Socios</span></b>
        </div>
        <nav className="nav">
          {NAV.map(({ k, label, Icon }) => (
            <a key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}><Icon /> {label}</a>
          ))}
        </nav>
        <div className="side-foot">
          Andrés &amp; Balmo · source of truth<br />
          <span style={{ cursor: "pointer", color: "var(--cobalt)", fontWeight: 600 }} onClick={() => {
            const cur = document.documentElement.getAttribute("data-theme");
            const next = cur === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            try { localStorage.setItem("curva_theme", next); } catch { /* noop */ }
          }}>Cambiar tema</span>
        </div>
      </aside>

      <main className="main">
        {sec === "panel" && <Panel st={st} overhead={overhead} update={update} />}
        {sec === "calculadora" && <Calculadora st={st} active={active} clientes={clientes} update={update} updateActive={updateActive} setSec={setSec} setToast={setToast} />}
        {sec === "proyectos" && <Proyectos st={st} update={update} setActive={(id) => { update((s) => { s.activeId = id; return s; }); setSec("calculadora"); }} />}
        {sec === "mimes" && <MiMes st={st} setSec={setSec} />}
        {sec === "cajas" && <Cajas st={st} update={update} setSec={setSec} />}
        {sec === "facturas" && <Facturas st={st} clientes={clientes} update={update} />}
        {sec === "reglas" && <ReglasView st={st} update={update} />}
      </main>
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

/* ---------------- Panel ---------------- */
function Panel({ st, overhead, update }: { st: State; overhead: number; update: (fn: (s: State) => State) => void }) {
  const inm = st.projects.filter((p) => p.inMonth && !p.borrador);
  let fact = 0, banca = 0, utilKept = 0;
  const ppl: Record<string, { nombre: string; quien: Quien; trabajo: number; extra: number; comision: number }> = {};
  inm.forEach((p) => {
    const r = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params)); fact += r.t; banca += r.banca; utilKept += r.sAutil + r.sButil;
    Object.values(r.people).forEach((a) => { const k = a.nombre + "|" + a.quien; if (!ppl[k]) ppl[k] = { nombre: a.nombre, quien: a.quien, trabajo: 0, extra: 0, comision: 0 }; ppl[k].trabajo += a.trabajo; ppl[k].extra += a.extra; ppl[k].comision += a.comision || 0; });
  });
  const preTax = Math.max(0, utilKept - overhead), neto = preTax * (1 - st.params.imp / 100);
  const meta = metaBanca(st.params);
  const rows = Object.values(ppl).filter((a) => a.trabajo + a.extra + a.comision > 0.5).sort((a, b) => (b.trabajo + b.extra + b.comision) - (a.trabajo + a.extra + a.comision) || order[a.quien] - order[b.quien]);
  const alerts: [string, string][] = [];
  if (banca < meta * 0.34) alerts.push(["warn", `La Banca del mes (${fmtMXN(banca)}) va corta para la meta del colchón (${fmtMXN(meta)}). Toma sombreros o sube la caja de ahorro.`]);
  else if (banca < meta) alerts.push(["info", `La Banca va en ${Math.round(banca / (meta || 1) * 100)}% de la meta (${fmtMXN(meta)}). Vas bien.`]);
  else alerts.push(["ok", "La Banca ya cubre la meta del colchón. Sano."]);
  inm.forEach((p) => { const r = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params)); const mr = r.marginOp / (r.t || 1); if (mr < 0.25) alerts.push(["warn", `${p.nombre}: margen bajo (${pctFmt(mr)}). Sube precio o baja gente.`]); });

  // ── Proyección: reparto acumulado y flujo por mes (todos los proyectos vivos) ──
  const vivos = st.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);
  let sAndres = 0, sBalmo = 0, sEquipo = 0, sBancaAll = 0, sCobrado = 0, sTicket = 0;
  const flujo: Record<string, number> = {};
  vivos.forEach((p) => {
    const rr = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params));
    sTicket += rr.t;
    sCobrado += (p.pagos || []).reduce((a, x) => a + (+x.monto || 0), 0);
    sBancaAll += rr.banca;
    Object.values(rr.people).forEach((a) => {
      const v = a.trabajo + a.extra;
      if (a.quien === "socioA") sAndres += v; else if (a.quien === "socioB") sBalmo += v; else sEquipo += v;
    });
    // flujo temporal del ingreso (sin IVA)
    const n = (p.modoCobro ?? "golpe") === "mensual" ? Math.max(1, p.plazoMeses ?? 1) : 1;
    const per = rr.t / n;
    for (let i = 0; i < n; i++) { const k = addMonths(p.fechaInicio || todayISO(), i); flujo[k] = (flujo[k] || 0) + per; }
  });
  const meses = Object.keys(flujo).sort().slice(0, 9);
  const maxFlujo = Math.max(1, ...meses.map((m) => flujo[m]));
  const porCobrar = Math.max(0, sTicket - sCobrado);

  return (
    <>
      <div className="page-h"><div><h1>Panel</h1><p>El estado de CURVA este mes, de un vistazo.</p></div></div>
      <div className="tiles rise">
        <Tile k="k-fact" l="Facturado del mes" v={fmtMXN(fact)} p={`${inm.length} proyecto${inm.length !== 1 ? "s" : ""}`} tip="Suma del valor (sin IVA) de los proyectos marcados como 'cuenta en el mes'." />
        <Tile k="k-a" l="Utilidad bruta socios" v={fmtMXN(utilKept)} p="antes de gastos" tip="Lo que se reparten Andrés y Balmo juntos este mes, ANTES de restar gastos e impuestos." />
        <Tile k="k-banca" l="A la Banca" v={fmtMXN(banca)} p="ahorro del mes" tip="Lo que se va al colchón de ahorro de CURVA este mes." />
        <Tile k="k-neto" l="Utilidad NETA socios" v={fmtMXN(neto)} p="después de gastos e imp." tip="Lo que de verdad les queda a los socios: utilidad bruta − gastos (overhead) − impuesto aprox." />
      </div>
      <div className="two rise r2">
        <div className="card">
          <h2>Banca — colchón de CURVA</h2>
          <div className="prog"><i style={{ width: Math.min(100, banca / (meta || 1) * 100) + "%" }} /></div>
          <div className="prog-lbl"><span>Generado este mes: <b>{fmtMXN(banca)}</b></span><span>Meta del colchón: <b>{fmtMXN(meta)}</b></span></div>
          <p className="foot">La Banca la alimentan el descuento del sombrero de socio y la caja de ahorro. Es el colchón de emergencia de CURVA y el trampolín para pasar a alguien a nómina. Meta: <b>{fmtMXN(meta)}</b>.</p>
        </div>
        <div className="card"><h2>Alertas</h2>{alerts.map((a, i) => <div key={i} className={"alert " + a[0]}>{a[1]}</div>)}</div>
      </div>
      <div className="two">
        <div className="card"><h2>Proyectos del mes</h2>{inm.length ? inm.map((p) => { const r = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params)); return (<div key={p.id} className="grow"><div><div className="gn">{p.nombre}</div><div className="gt">{p.tipo} · {p.members.length} pers.</div></div><div className="gv">{fmtMXN(r.t)}</div><div className="gm">margen {pctFmt(r.marginOp / (r.t || 1))}</div></div>); }) : <div className="hint">Ningún proyecto en el mes.</div>}</div>
        <div className="card"><h2>Cuánto se lleva cada quien</h2><Rank rows={rows} /></div>
      </div>

      <div className="card rise r4">
        <h2>Proyección — todos los proyectos vivos</h2>
        <div className="split3" style={{ marginBottom: 18 }}>
          <div className="s3" style={{ background: "var(--cobalt-soft)" }}><div className="s3l"><i style={{ background: "var(--c-andres)" }} />Tú ({st.params.nombreA})</div><div className="s3v" style={{ color: "var(--c-andres)" }}>{fmtMXN(sAndres)}</div><div className="s3p">tu parte total (trabajo + utilidad)</div></div>
          <div className="s3"><div className="s3l"><i style={{ background: "var(--c-equipo)" }} />El equipo</div><div className="s3v">{fmtMXN(sEquipo)}</div><div className="s3p">{st.params.nombreB}: {fmtMXN(sBalmo)} aparte</div></div>
          <div className="s3"><div className="s3l"><i style={{ background: "var(--c-banca)" }} />La Banca</div><div className="s3v" style={{ color: "var(--c-banca)" }}>{fmtMXN(sBancaAll)}</div><div className="s3p">colchón de CURVA</div></div>
        </div>
        <div className="prog-lbl" style={{ marginBottom: 4 }}><span>Cobrado: <b>{fmtMXN(sCobrado)}</b></span><span>Por cobrar: <b>{fmtMXN(porCobrar)}</b></span></div>
        <div className="prog"><i style={{ width: Math.min(100, sCobrado / (sTicket || 1) * 100) + "%" }} /></div>
        <h2 style={{ marginTop: 22 }}>Flujo de ingresos por mes</h2>
        {meses.length ? (
          <div className="flow">
            {meses.map((m) => (
              <div className="flow-col" key={m}>
                <div className="flow-v">{fmtMXN(flujo[m])}</div>
                <div className="flow-bar" style={{ height: Math.max(6, flujo[m] / maxFlujo * 96) + "px" }}><div className="flow-seg" style={{ height: "100%", background: "var(--grad)" }} /></div>
                <div className="flow-x">{mesLabel(m)}</div>
              </div>
            ))}
          </div>
        ) : <div className="hint">Agrega proyectos con fecha de inicio para ver el flujo.</div>}
        <p className="foot">Reparte cada proyecto en el tiempo según su plazo y forma de cobro (mensual = dividido entre los meses; de golpe = todo en el mes de arranque). Ingresos sin IVA.</p>
      </div>

      <DatosCobro st={st} update={update} />
    </>
  );
}

/* Datos de cobro de CURVA — ficha bancaria descargable + editor. */
function DatosCobro({ st, update }: { st: State; update: (fn: (s: State) => State) => void }) {
  const [edit, setEdit] = useState(false);
  const b = { ...DEF_BANCO, ...(st.banco || {}) };
  const set = (k: keyof DatosBancarios, v: string) => update((s) => { s.banco = { ...DEF_BANCO, ...(s.banco || {}), [k]: v }; return s; });
  const campos: [keyof DatosBancarios, string][] = [
    ["banco", "Banco"], ["titular", "Titular"], ["cuenta", "No. de cuenta"],
    ["clabe", "CLABE"], ["swift", "SWIFT / BIC"], ["producto", "Producto (opcional)"],
  ];
  return (
    <div className="card">
      <div className="tes-h">
        <h2 style={{ margin: 0 }}>Datos de cobro</h2>
        <button className="deuda-toggle" onClick={() => setEdit(!edit)}>{edit ? "listo" : "editar"}</button>
      </div>
      <p className="hint" style={{ marginTop: -4 }}>La ficha bancaria de CURVA para que los clientes te paguen. Descárgala y mándala por WhatsApp o correo.</p>
      {!edit ? (
        <div className="bank-mini">
          <div className="bank-mini-rows">
            <div><span>Banco</span><b>{b.banco}</b></div>
            <div><span>CLABE</span><b>{b.clabe}</b></div>
            <div><span>Titular</span><b>{b.titular}</b></div>
          </div>
          <button className="btn primary" onClick={() => window.open("/pdf/banco", "_blank")}><FileText size={15} /> Descargar ficha</button>
        </div>
      ) : (
        <div className="bank-edit">
          {campos.map(([k, l]) => (
            <div className="field" key={k} style={{ margin: 0 }}><label>{l}</label>
              <input type="text" value={b[k]} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Mi mes (vista de justicia) ----------------
   Suma lo que gana cada persona en TODOS los proyectos activos de un mes dado
   (usando repartoPorMes, Método A) y lo ordena para vigilar que el reparto sea
   justo. El semáforo marca a quien se dispara respecto al promedio del EQUIPO
   (los socios no cuentan para el flag: su utilidad es por diseño, no injusticia). */
type AggMes = { nombre: string; quien: Quien; trabajo: number; extra: number; comision: number; neto: number; proyectos: string[] };
function MiMes({ st, setSec }: { st: State; setSec: (s: string) => void }) {
  const P = st.params;
  const vivos = st.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);
  // Reparto por mes de cada proyecto, indexado por mes-calendario "YYYY-MM".
  const projMonths = vivos.map((p) => {
    const R = reglasDe(p, P);
    const rm = repartoPorMes(membersResolved(p, st.roster, R), R);
    const inicio = p.fechaInicio || todayISO();
    const byYM: Record<string, ReparteMesLite> = {};
    rm.forEach((x) => { byYM[addMonths(inicio, x.mes - 1)] = { personas: x.personas }; });
    return { p, byYM };
  });
  const allYM = Array.from(new Set(projMonths.flatMap((x) => Object.keys(x.byYM)))).sort();
  const curYM = todayISO().slice(0, 7);
  const [ym, setYm] = useState<string>(allYM.includes(curYM) ? curYM : (allYM[0] || curYM));
  const sel = allYM.includes(ym) ? ym : (allYM[0] || ym);

  const agg: Record<string, AggMes> = {};
  const proyectosMes: string[] = [];
  projMonths.forEach(({ p, byYM }) => {
    const rm = byYM[sel]; if (!rm) return;
    proyectosMes.push(p.nombre);
    Object.values(rm.personas).forEach((pe) => {
      if (pe.trabajo + pe.extra + pe.comision <= 0.5) return;
      const k = pe.nombre + "|" + pe.quien;
      if (!agg[k]) agg[k] = { nombre: pe.nombre, quien: pe.quien, trabajo: 0, extra: 0, comision: 0, neto: 0, proyectos: [] };
      agg[k].trabajo += pe.trabajo; agg[k].extra += pe.extra; agg[k].comision += pe.comision; agg[k].neto += pe.neto;
      if (!agg[k].proyectos.includes(p.nombre)) agg[k].proyectos.push(p.nombre);
    });
  });
  const totOf = (a: AggMes) => a.trabajo + a.extra + a.comision;
  const rows = Object.values(agg).sort((a, b) => totOf(b) - totOf(a) || order[a.quien] - order[b.quien]);
  const team = rows.filter((a) => !isSocio(a.quien));
  const teamAvg = team.length ? team.reduce((s, a) => s + totOf(a), 0) / team.length : 0;
  const flagOf = (a: AggMes): "" | "warn" | "bad" => {
    if (isSocio(a.quien) || teamAvg <= 0) return "";
    const t = totOf(a);
    return t > teamAvg * 2 ? "bad" : t > teamAvg * 1.6 ? "warn" : "";
  };
  const totalTeam = team.reduce((s, a) => s + totOf(a), 0);
  const totalSocios = rows.filter((a) => isSocio(a.quien)).reduce((s, a) => s + totOf(a), 0);
  const max = Math.max(1, ...rows.map(totOf));

  return (
    <>
      <div className="page-h"><div><h1>Mi mes</h1><p>Cuánto gana cada persona este mes sumando <b>todos</b> sus proyectos — para que el reparto sea justo.</p></div></div>

      {allYM.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
          <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>No hay proyectos con fecha de inicio y plazo. Agrégalos en la Calculadora.</p>
          <button className="btn primary" onClick={() => setSec("calculadora")}>Ir a la Calculadora</button>
        </div>
      ) : (
        <>
          <div className="proj-bar" style={{ flexWrap: "wrap" }}>
            <div className="pb-group"><span className="pb-cap"><CalendarRange size={13} style={{ verticalAlign: -2 }} /> Mes</span>
              <div className="chips">
                {allYM.map((m) => <button key={m} className="chip-btn" aria-pressed={m === sel} onClick={() => setYm(m)}>{mesLabel(m)}</button>)}
              </div>
            </div>
          </div>

          <div className="tiles rise">
            <Tile k="k-fact" l="Proyectos activos" v={String(proyectosMes.length)} p={proyectosMes.join(" · ") || "—"} tip="Proyectos que están corriendo en el mes seleccionado." />
            <Tile k="k-equipo" l="Al equipo (Núcleo/nuevos)" v={fmtMXN(totalTeam)} p={`promedio ${fmtMXN(teamAvg)}`} tip="Suma del trabajo del equipo (sin socios) en el mes, cruzando todos los proyectos." />
            <Tile k="k-a" l="A los socios" v={fmtMXN(totalSocios)} p="trabajo + utilidad" tip="Lo que ganan los socios este mes (por su trabajo y su utilidad de dueños)." />
            <Tile k="k-banca" l="ISR reservado" v={pctFmt((P.imp || 0) / 100)} p="sobre el bruto" tip="El % que se aparta para impuestos (editable en Reglas). El neto de cada quien ya lo descuenta." />
          </div>

          <div className="card">
            <h2>Reparto del mes por persona</h2>
            <p className="hint" style={{ marginTop: 0 }}>Ordenado de mayor a menor. El <b>semáforo</b> avisa si alguien del equipo se dispara respecto al promedio (🟡 &gt;1.6× · 🔴 &gt;2×). Los socios no se marcan: su utilidad es por diseño.</p>
            {rows.length === 0 ? <div className="hint">Nadie trabaja proyectos este mes.</div> : (
              <div className="rank">
                {rows.map((a, i) => {
                  const tot = totOf(a), fl = flagOf(a);
                  const dot = fl === "bad" ? "#e5484d" : fl === "warn" ? "#f5a524" : "var(--pos)";
                  return (
                    <div key={i} className="rk">
                      <div className="who">
                        <span title={fl === "bad" ? "Gana >2× el promedio del equipo" : fl === "warn" ? "Gana >1.6× el promedio" : "En rango"} style={{ width: 8, height: 8, borderRadius: 99, background: dot, display: "inline-block", flex: "0 0 auto" }} />
                        <span className="nm" title={a.proyectos.join(" · ")}>{a.nombre}</span>
                        <span className={"badge " + badgeCls[a.quien]}>{badgeTxt[a.quien]}</span>
                      </div>
                      <div className="track"><i style={{ width: Math.max(3, tot / max * 100) + "%", background: `var(${roleColor[a.quien]})` }} /></div>
                      <div className="amt">{fmtMXN(tot)}<span className="amt-comis">neto {fmtMXN(a.neto)} · {a.proyectos.length}p</span></div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="foot"><b>Ojo:</b> lo que protege al equipo no es el bracket, es la <b>utilización</b> — mantenerlos ocupados en varios proyectos. Un Núcleo full-time gana $14k–$56k/mes; a medio tiempo, la mitad. Si alguien sale bajo, súbele carga o revisa el pool del Núcleo en Reglas.</p>
          </div>
        </>
      )}
    </>
  );
}
type ReparteMesLite = { personas: ReparteMes["personas"] };

/* ---------------- Equipo por mes (agenda) ----------------
   Deja variar quién trabaja y con qué rol cada mes ("este mes piloteo yo, el que
   viene Lomba"). NO cambia la bolsa total (esa sale del ticket completo, Método A):
   solo redistribuye entre meses/personas. Sin agenda, el equipo base va todos los
   meses por igual. */
function AgendaEditor({ active, st, P, updateActive }: {
  active: Proyecto; st: State; P: Reglas; updateActive: (fn: (p: Proyecto) => void) => void;
}) {
  const N = Math.max(1, active.plazoMeses ?? 1);
  if (N < 2) return null;
  const on = !!active.agenda;
  const seed = (): Record<number, Miembro[]> => {
    const a: Record<number, Miembro[]> = {};
    for (let m = 1; m <= N; m++) a[m] = active.members.map((x) => ({ ...x }));
    return a;
  };
  const toggle = () => updateActive((p) => { if (p.agenda) delete p.agenda; else p.agenda = seed(); });
  const mem = (m: number): Miembro[] => (active.agenda && active.agenda[m]?.length ? active.agenda[m] : active.members);
  const setMonth = (m: number, fn: (list: Miembro[]) => void) => updateActive((p) => {
    if (!p.agenda) p.agenda = {};
    if (!p.agenda[m]) p.agenda[m] = (p.members).map((x) => ({ ...x }));
    fn(p.agenda[m]);
  });
  const choose = (m: number, i: number, id: string) => {
    if (id === "__cur") return;
    setMonth(m, (list) => {
      const mm = list[i]; if (!mm) return;
      if (id === "socioA") { mm.personId = "socioA"; mm.quien = "socioA"; mm.nombre = P.nombreA; mm.sm = 1; }
      else if (id === "socioB") { mm.personId = "socioB"; mm.quien = "socioB"; mm.nombre = P.nombreB; mm.sm = 1; }
      else { const rp = st.roster.find((r) => r.id === id); if (rp) { mm.personId = rp.id; mm.quien = rp.quien; mm.nombre = rp.nombre; mm.sm = rp.quien === "nuevo" ? P.smNuevo : 1; } }
    });
  };
  const personVal = (mm: Miembro): string => {
    if (mm.personId === "socioA" || mm.quien === "socioA") return "socioA";
    if (mm.personId === "socioB" || mm.quien === "socioB") return "socioB";
    if (mm.personId && st.roster.some((r) => r.id === mm.personId)) return mm.personId;
    const byName = st.roster.find((r) => r.nombre === mm.nombre);
    return byName ? byName.id : "__cur";
  };
  const addTo = (m: number) => setMonth(m, (list) => {
    const used = new Set(list.map((x) => x.personId));
    const rp = st.roster.find((r) => !used.has(r.id)) || st.roster[0];
    if (rp) list.push({ rol: "A", quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1, personId: rp.id });
    else list.push({ rol: "A", quien: "socioA", nombre: P.nombreA, sm: 1, personId: "socioA" });
  });

  return (
    <div className="card">
      <div className="tes-h">
        <h2 style={{ margin: 0 }}>Equipo por mes <span className="tip" data-tip="Cambia quién trabaja y con qué rol cada mes. No mueve el total del equipo (ese sale del proyecto completo): solo reparte entre los meses."><Info /></span></h2>
        <button className="deuda-toggle" onClick={toggle}>{on ? "usar equipo fijo" : "variar por mes"}</button>
      </div>
      {!on ? (
        <p className="hint" style={{ marginTop: -2 }}>Hoy el mismo equipo trabaja los {N} meses. Actívalo si alguien entra/sale o cambia de rol mes a mes (ej. este mes pilotea uno, el siguiente otro).</p>
      ) : (
        <>
          <p className="hint" style={{ marginTop: -2 }}>La <b>bolsa total del equipo</b> no cambia; solo mueves <b>quién</b> la cobra cada mes. El detalle mes a mes se ve en <b>Mi mes</b>.</p>
          <div className="agenda-months">
            {Array.from({ length: N }, (_, k) => k + 1).map((m) => {
              const inicio = active.fechaInicio || todayISO();
              return (
                <div className="agenda-mes" key={m} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                  <div className="gt" style={{ fontWeight: 700, marginBottom: 8 }}>Mes {m} · {mesLabel(addMonths(inicio, m - 1))}</div>
                  {mem(m).map((mm, i) => (
                    <div className="member2" key={i}>
                      <select value={personVal(mm)} onChange={(e) => choose(m, i, e.target.value)}>
                        <optgroup label="Socios"><option value="socioA">{P.nombreA}</option><option value="socioB">{P.nombreB}</option></optgroup>
                        {st.roster.length > 0 && <optgroup label="Equipo">{st.roster.map((rp) => <option key={rp.id} value={rp.id}>{rp.nombre}</option>)}</optgroup>}
                        {personVal(mm) === "__cur" && <option value="__cur">{mm.nombre || "— sin asignar —"}</option>}
                      </select>
                      <div className="member-rol">
                        <div className="chips">
                          {(["P", "E", "A"] as Rol[]).map((rl) => (
                            <button key={rl} className="chip-btn" aria-pressed={mm.rol === rl} onClick={() => setMonth(m, (list) => { if (list[i]) list[i].rol = rl; })}>{ROLNAME[rl]}</button>
                          ))}
                        </div>
                        <button className="rmv" title="Quitar de este mes" onClick={() => setMonth(m, (list) => { list.splice(i, 1); })}>×</button>
                      </div>
                    </div>
                  ))}
                  <button className="add" onClick={() => addTo(m)}>+ Agregar a este mes</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Reparto mes a mes (dentro de la Calculadora) ----------------
   Cuando el proyecto dura >1 mes, muestra cuánto cobra cada persona CADA MES y su
   TOTAL del proyecto. Sin agenda = parejo (mismo cada mes); con agenda = varía. */
function RepartoMensual({ pr, P }: { pr: Proyecto; P: Reglas }) {
  const N = Math.max(1, pr.plazoMeses ?? 1);
  if (N < 2) return null;
  const meses = repartoPorMes(pr, P);
  const inicio = pr.fechaInicio || todayISO();
  type Row = { nombre: string; quien: Quien; total: number; porMes: number[] };
  const map: Record<string, Row> = {};
  meses.forEach((mm, idx) => {
    Object.values(mm.personas).forEach((pe) => {
      const v = pe.trabajo + pe.extra + pe.comision;
      const k = pe.nombre + "|" + pe.quien;
      if (!map[k]) map[k] = { nombre: pe.nombre, quien: pe.quien, total: 0, porMes: Array(N).fill(0) };
      map[k].porMes[idx] += v; map[k].total += v;
    });
  });
  const rows = Object.values(map).filter((r) => r.total > 0.5).sort((a, b) => b.total - a.total || order[a.quien] - order[b.quien]);
  if (!rows.length) return null;
  const totalPorMes = meses.map((_, idx) => rows.reduce((s, r) => s + r.porMes[idx], 0));
  const granTotal = rows.reduce((s, r) => s + r.total, 0);
  const varia = !!pr.agenda;
  return (
    <div className="card">
      <h2>Cada quien, mes a mes</h2>
      <p className="hint" style={{ marginTop: 0 }}>{varia ? "El equipo cambia por mes (agenda): esto es lo que cobra cada quien cada mes y su total del proyecto." : `Cobro parejo: cada quien cobra lo mismo los ${N} meses. Última columna = total del proyecto.`}</p>
      <div className="mes-matrix">
        <div className="mm-grid" style={{ gridTemplateColumns: `minmax(116px,1.3fr) repeat(${N}, minmax(76px,1fr)) minmax(94px,1fr)` }}>
          <div className="mm-h mm-name">Persona</div>
          {meses.map((mm) => <div key={mm.mes} className="mm-h mm-num">{mesLabel(addMonths(inicio, mm.mes - 1))}</div>)}
          <div className="mm-h mm-num mm-tot">Total</div>
          {rows.map((rw, i) => (
            <Fragment key={i}>
              <div className="mm-name"><span className="nm">{rw.nombre}</span><span className={"badge " + badgeCls[rw.quien]}>{badgeTxt[rw.quien]}</span></div>
              {rw.porMes.map((v, idx) => <div key={idx} className="mm-num">{fmtMXN(v)}</div>)}
              <div className="mm-num mm-tot">{fmtMXN(rw.total)}</div>
            </Fragment>
          ))}
          <div className="mm-name mm-foot">Total del mes</div>
          {totalPorMes.map((v, idx) => <div key={idx} className="mm-num mm-foot">{fmtMXN(v)}</div>)}
          <div className="mm-num mm-foot mm-tot">{fmtMXN(granTotal)}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Calculadora ---------------- */
function Calculadora({ st, active, clientes, update, updateActive, setSec, setToast }: {
  st: State; active: Proyecto; clientes: Cliente[];
  update: (fn: (s: State) => State) => void; updateActive: (fn: (p: Proyecto) => void) => void; setSec: (s: string) => void; setToast: (m: string) => void;
}) {
  // Nuevo borrador limpio (descarta cualquier borrador anterior sin guardar).
  const nuevoBorrador = () => update((s) => {
    s.projects = s.projects.filter((x) => !x.borrador);
    const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id;
    return s;
  });
  // Guardar: fija el proyecto actual (deja de ser borrador), limpia la Calculadora
  // con un borrador nuevo y te lleva a Proyectos.
  const guardarYNuevo = () => {
    const nombre = (st.projects.find((x) => x.id === st.activeId)?.nombre || "El proyecto").trim();
    update((s) => {
      const cur = s.projects.find((x) => x.id === s.activeId);
      // Congela la foto de las Reglas de dinero al guardar: desde ya, mover perillas en
      // Reglas para otro proyecto NO recalcula este. Re-guardar re-congela con las de hoy.
      if (cur) { cur.borrador = false; cur.reglas = { ...s.params }; }
      s.projects = s.projects.filter((x) => !x.borrador);
      const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id;
      return s;
    });
    setToast(`“${nombre}” guardado`);
    setSec("proyectos");
  };
  if (!active) return (
    <>
      <div className="page-h"><div><h1>Calculadora</h1><p>Mete el proyecto y ve, peso por peso, cuánto le toca a cada quien.</p></div></div>
      <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>No tienes proyectos todavía.</p>
        <button className="btn primary" onClick={nuevoBorrador}>+ Crear el primero</button>
      </div>
    </>
  );
  // Borrador → params vivos (afinas mientras armas). Guardado → su foto congelada.
  const P = reglasDe(active, st.params), r = compute(membersResolved(active, st.roster, P), P), t = r.t || 1;
  // Lo que REALMENTE aterriza en la Masa salarial: la bolsa menos el "sombrero de
  // socio" (disc), que no se queda en el equipo sino que se va a la Banca. Sumar la
  // bolsa completa aquí Y la Banca aparte cuenta el disc dos veces → la barra no
  // cuadraba con el ingreso (bug reportado por Balmo). Incluye el bono del Núcleo
  // (poolAmt) para que Equipo+Caja+Banca+socios == ingreso exacto.
  const equipoTot = r.bolsaOut - r.disc + r.comisPaid + r.poolAmt;
  const segs = [
    { k: "Equipo", v: equipoTot, c: "--c-equipo" }, { k: "Caja proyecto", v: Math.max(0, r.cajaProj), c: "--c-caja" },
    { k: "Banca", v: r.banca, c: "--c-banca" }, { k: P.nombreA, v: r.sAutil, c: "--c-andres" }, { k: P.nombreB, v: r.sButil, c: "--c-balmo" },
  ].filter((s) => s.v > 0.5);
  const totSeg = segs.reduce((s, x) => s + x.v, 0) || 1;
  const rows = Object.values(r.people).filter((x) => x.trabajo + x.extra + (x.comision || 0) > 0.5).sort((a, b) => (b.trabajo + b.extra + (b.comision || 0)) - (a.trabajo + a.extra + (a.comision || 0)) || order[a.quien] - order[b.quien]);
  let tT = 0, tE = 0, tC = 0; Object.values(r.people).forEach((a) => { tT += a.trabajo; tE += a.extra; tC += a.comision || 0; });
  // La comisión ahora vive en su propio campo (franjita naranja); se suma aparte al cuadre.
  const leak = r.t - (tT + tE + tC + r.cajaProj + r.banca);
  const mr = r.marginOp / t;
  const bd = (cls: string, l: string, v: number) => <div className={"bd-row " + cls}><span className="bl">{l}</span><span className="bv">{fmtMXN(v)}</span></div>;

  // ── Selector de personas (roster) ──
  const personVal = (m: Miembro): string => {
    if (m.personId === "socioA" || m.quien === "socioA") return "socioA";
    if (m.personId === "socioB" || m.quien === "socioB") return "socioB";
    if (m.personId && st.roster.some((r) => r.id === m.personId)) return m.personId;
    const byName = st.roster.find((r) => r.nombre === m.nombre);
    return byName ? byName.id : "__cur";
  };
  const choosePerson = (i: number, id: string) => {
    if (id === "__cur") return;
    if (id === "__new") {
      update((s) => {
        const np: RosterPerson = { id: uid(), nombre: "Nueva persona", quien: "nucleo" };
        s.roster.push(np);
        const proj = s.projects.find((x) => x.id === s.activeId);
        if (proj && proj.members[i]) { const m = proj.members[i]; m.personId = np.id; m.nombre = np.nombre; m.quien = "nucleo"; m.sm = 1; }
        return s;
      });
      return;
    }
    updateActive((p) => {
      const m = p.members[i]; if (!m) return;
      if (id === "socioA") { m.personId = "socioA"; m.quien = "socioA"; m.nombre = P.nombreA; m.sm = 1; }
      else if (id === "socioB") { m.personId = "socioB"; m.quien = "socioB"; m.nombre = P.nombreB; m.sm = 1; }
      else { const rp = st.roster.find((r) => r.id === id); if (rp) { m.personId = rp.id; m.quien = rp.quien; m.nombre = rp.nombre; m.sm = rp.quien === "nuevo" ? P.smNuevo : 1; } }
    });
  };
  const addMember = () => updateActive((p) => {
    const used = new Set(p.members.map((m) => m.personId));
    const rp = st.roster.find((r) => !used.has(r.id)) || st.roster[0];
    if (rp) p.members.push({ rol: "A", quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1, personId: rp.id });
    else p.members.push({ rol: "A", quien: "socioA", nombre: P.nombreA, sm: 1, personId: "socioA" });
  });
  // Solo Núcleo/externos pueden cobrar comisión (los socios NUNCA — blindaje).
  const nombresEquipo = st.roster.map((r) => r.nombre);

  return (
    <>
      <div className="page-h"><div><h1>Calculadora</h1><p>Mete el proyecto y ve, peso por peso, cuánto le toca a cada quien.</p></div></div>
      <div className="proj-bar">
        <div className="pb-group">
          <span className="pb-cap">Proyecto abierto <span className="tip" data-tip="Cambia entre tus proyectos guardados. Lo que elijas aquí es lo que ves y editas abajo."><Info /></span></span>
          <select value={active.id} onChange={(e) => update((s) => { s.activeId = e.target.value; return s; })}>
            {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.borrador ? " · sin guardar" : p.inMonth ? "" : " · fuera del mes"}</option>)}
          </select>
        </div>
        <div className="pb-group grow">
          <span className="pb-cap">Nombre <span className="tip" data-tip="Cómo se llama este proyecto (ej. el cliente). Escríbelo aquí para renombrarlo."><Info /></span></span>
          <input type="text" value={active.nombre} placeholder="Nombre del proyecto" onChange={(e) => updateActive((p) => { p.nombre = e.target.value; })} />
        </div>
        <div className="pb-actions">
          <button className="btn" title="Empieza un proyecto nuevo en blanco" onClick={nuevoBorrador}><Plus size={15} /> Nuevo</button>
          <button className="btn danger" title="Borra el proyecto abierto" onClick={() => update((s) => { s.projects = s.projects.filter((x) => x.id !== s.activeId); s.activeId = s.projects[0]?.id || ""; return s; })}>Borrar</button>
          <button className="btn primary" title="Guarda este proyecto y deja la Calculadora lista para el siguiente" onClick={guardarYNuevo}>Guardar proyecto <ArrowRight size={15} /></button>
        </div>
        <label className="pb-month">
          <input type="checkbox" checked={active.inMonth} onChange={(e) => updateActive((p) => { p.inMonth = e.target.checked; })} /> Cuenta en el mes
          <span className="tip" data-tip="Si está marcado, este proyecto suma en los totales del Panel de ESTE mes (facturado, utilidad, Banca). Desmárcalo si es de otro mes o aún no arranca."><Info /></span>
        </label>
      </div>

      <div className="grid rise">
        <div className="sidec">
          <div className="card">
            <h2>El proyecto</h2>
            {(() => {
              const modo: "sin" | "mas" | "incluido" = active.ivaModo ?? (active.conIVA ? "mas" : "sin");
              const incluido = modo === "incluido";
              const conIVA = modo !== "sin";
              const inputVal = incluido ? Math.round(active.ticket * (1 + IVA) * 100) / 100 : active.ticket;
              const setModo = (m: "sin" | "mas" | "incluido") => updateActive((p) => { p.ivaModo = m; p.conIVA = m !== "sin"; });
              const onTicket = (v: number) => updateActive((p) => { p.ticket = incluido ? Math.round(ticketSinIVA(v) * 100) / 100 : v; });
              const base = active.ticket, iva = conIVA ? base * IVA : 0, total = base + iva;
              return (
                <>
                  <div className="field"><label>{incluido ? "Precio total del proyecto (con IVA)" : modo === "mas" ? "Precio del proyecto (antes de IVA)" : "Valor del proyecto"}</label>
                    <div className="money-in"><span>$</span><input type="number" value={inputVal} onChange={(e) => onTicket(+e.target.value || 0)} /></div>
                  </div>
                  <div className="field"><label>¿Este precio lleva IVA? <span className="tip" data-tip="Una sola pregunta. El modelo SIEMPRE reparte la base sin IVA; esto solo dice cómo tecleaste el número y si el cliente paga IVA."><Info /></span></label>
                    <div className="chips">
                      <button className="chip-btn" aria-pressed={modo === "sin"} onClick={() => setModo("sin")}>Sin IVA</button>
                      <button className="chip-btn" aria-pressed={modo === "mas"} onClick={() => setModo("mas")}>+ IVA encima</button>
                      <button className="chip-btn" aria-pressed={modo === "incluido"} onClick={() => setModo("incluido")}>IVA incluido</button>
                    </div>
                    <p className="hint" style={{ marginTop: 6, marginBottom: 8 }}>
                      {modo === "sin" && "No facturas IVA. El precio que tecleas es lo que se reparte."}
                      {modo === "mas" && "Tecleas el precio antes de IVA; al cliente se le suma 16% encima."}
                      {incluido && "Tecleas el total que paga el cliente (ya con IVA); la app le quita el 16% para el reparto."}
                    </p>
                    <div className="iva-box">
                      <div className="iva-row"><span>Base (sin IVA) <b className="iva-tag">se reparte</b></span><b style={{ color: "var(--cobalt)" }}>{fmtMXN(base)}</b></div>
                      <div className="iva-row muted"><span>IVA (16%) {conIVA ? "· de Hacienda, no se reparte" : ""}</span><span>{fmtMXN(iva)}</span></div>
                      <div className="iva-row total"><span>Total que paga el cliente</span><b>{fmtMXN(total)}</b></div>
                    </div>
                    <p className="hint" style={{ marginTop: 8 }}>De la base, al equipo le toca <b style={{ color: "var(--cobalt)" }}>{pctFmt(r.bolsaOut / (r.t || 1))}</b> = {fmtMXN(r.bolsaOut)}.</p>
                  </div>
                </>
              );
            })()}
            <div className="two" style={{ gap: 12 }}>
              <div className="field"><label>Plazo (meses)</label><input type="number" min={1} max={24} value={active.plazoMeses ?? 1} onChange={(e) => updateActive((p) => { p.plazoMeses = Math.max(1, +e.target.value || 1); })} /></div>
              <div className="field"><label>Arranca</label><input type="date" value={active.fechaInicio ?? todayISO()} onChange={(e) => updateActive((p) => { p.fechaInicio = e.target.value; })} /></div>
            </div>
            <div className="field"><label>¿Cómo cobras?</label>
              <div className="chips">
                <button className="chip-btn" aria-pressed={(active.modoCobro ?? "golpe") === "golpe"} onClick={() => updateActive((p) => { p.modoCobro = "golpe"; })}>De golpe</button>
                <button className="chip-btn" aria-pressed={active.modoCobro === "mensual"} onClick={() => updateActive((p) => { p.modoCobro = "mensual"; })}>Mensual</button>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>{(active.modoCobro ?? "golpe") === "mensual" && (active.plazoMeses ?? 1) > 1 ? <>~{fmtMXN(totalCliente(active) / (active.plazoMeses || 1))}/mes durante {active.plazoMeses} meses.</> : "Todo en uno o dos pagos."}</p>
            </div>
            <div className="field"><label>Tipo</label><div className="chips">{(["trazo", "trayectoria", "alianza"] as const).map((tp) => <button key={tp} className="chip-btn" aria-pressed={active.tipo === tp} onClick={() => updateActive((p) => { p.tipo = tp; p.cajaPct = cajaPreset[tp]; })}>{tp[0].toUpperCase() + tp.slice(1)}</button>)}</div></div>
            <div className="field"><label>¿Quién trajo este cliente? <span className="tip" data-tip="Decide quién se lleva la comisión (10% del margen) por CONSEGUIR al cliente. No cambia lo que paga el cliente, solo a dónde va ese 10%."><Info /></span></label>
              <div className="chips">
                <button className="chip-btn" aria-pressed={(active.origen || "empresa") === "empresa"} onClick={() => updateActive((p) => { p.origen = "empresa"; })}>La marca</button>
                <button className="chip-btn" aria-pressed={active.origen === "socio"} onClick={() => updateActive((p) => { p.origen = "socio"; })}>Un socio</button>
                <button className="chip-btn" aria-pressed={active.origen === "persona"} onClick={() => updateActive((p) => { p.origen = "persona"; })}>Equipo</button>
              </div>
              {active.origen === "persona" && (
                <select style={{ marginTop: 8 }} value={active.origenPersona || ""} onChange={(e) => updateActive((p) => { p.origenPersona = e.target.value; })}>
                  <option value="">— ¿quién lo trajo? —</option>
                  {nombresEquipo.map((n, i) => <option key={i} value={n}>{n}</option>)}
                </select>
              )}
              {(() => {
                const comisPot = Math.min(Math.max(0, r.marginBruto) * (P.comisPct / 100), P.comisTope);
                const o = active.origen || "empresa";
                return (
                  <div className="origen-help">
                    {o === "empresa" && <><b>La marca lo trajo → sin comisión.</b> El cliente llegó por CURVA (web, inbound, recomendación), no lo consiguió una persona. No se aparta comisión: ese {P.comisPct}% se queda dentro y engorda la <b>utilidad de los socios</b>.</>}
                    {o === "socio" && <><b>Un socio lo trajo → la comisión va a la Banca.</b> Pagarle comisión a {P.nombreA} o {P.nombreB} le quitaría al otro socio, así que ese {P.comisPct}% (<b>{fmtMXN(comisPot)}</b>) no va a un bolsillo: se guarda en la <b>Banca</b> (el colchón de CURVA). Es la diferencia con “La marca”: aquí sí se aparta el {P.comisPct}% hacia el ahorro.</>}
                    {o === "persona" && <><b>Alguien del equipo/externo lo trajo → esa persona cobra la comisión.</b> Como no es socio, sí puede cobrar el {P.comisPct}% (<b>{fmtMXN(comisPot)}</b>) por conseguir al cliente, sin diluir a nadie.</>}
                  </div>
                );
              })()}
            </div>
            <div className="field"><label>Caja del proyecto <span style={{ color: "var(--cobalt)", fontFamily: "var(--mono)", fontWeight: 700 }}>{active.cajaPct}%</span></label><input type="range" min={0} max={25} value={active.cajaPct} onChange={(e) => updateActive((p) => { p.cajaPct = +e.target.value; })} /></div>
            <div className="field"><label>Cliente (de Notion)</label><select value={active.clienteId || ""} onChange={(e) => updateActive((p) => { p.clienteId = e.target.value || null; p.clienteNombre = clientes.find((c) => c.id === e.target.value)?.nombre || null; })}><option value="">— sin asignar —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          </div>
          <div className="card">
            <h2>El equipo del proyecto</h2>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>Elige a cada persona del equipo — la app ya sabe si es socio o Núcleo. Agrega o renombra gente en <b>Reglas › Personas</b>.</p>
            {active.members.map((m, i) => {
              const val = personVal(m);
              return (
              <div className="member2" key={i}>
                <select value={val} onChange={(e) => choosePerson(i, e.target.value)}>
                  <optgroup label="Socios"><option value="socioA">{P.nombreA}</option><option value="socioB">{P.nombreB}</option></optgroup>
                  {st.roster.length > 0 && <optgroup label="Equipo">{st.roster.map((rp) => <option key={rp.id} value={rp.id}>{rp.nombre}</option>)}</optgroup>}
                  {val === "__cur" && <option value="__cur">{m.nombre || "— sin asignar —"}</option>}
                  <option value="__new">➕ Nueva persona…</option>
                </select>
                <div className="member-rol">
                  <div className="chips">
                    {(["P", "E", "A"] as Rol[]).map((rl) => (
                      <button key={rl} className="chip-btn" aria-pressed={m.rol === rl} onClick={() => updateActive((p) => { p.members[i].rol = rl; })}>{ROLNAME[rl]}</button>
                    ))}
                  </div>
                  <button className="rmv" title="Quitar del proyecto" onClick={() => updateActive((p) => { p.members.splice(i, 1); })}>×</button>
                </div>
              </div>
              );
            })}
            <button className="add" onClick={addMember}>+ Agregar persona</button>
          </div>
          <AgendaEditor active={active} st={st} P={P} updateActive={updateActive} />
        </div>

        <div>
          <div className="tiles rise">
            <Tile k="k-curva" l="CURVA se queda" v={fmtMXN(r.marginOp)} p={`${pctFmt(r.marginOp / t)} del ingreso`} tip="Lo que le queda a CURVA (utilidad de socios + Banca) después de pagarle al equipo, la comisión y apartar la caja del proyecto." />
            <Tile k="k-a" l={r.sAseat > 0 ? `${P.nombreA} · trabaja` : P.nombreA} v={fmtMXN(r.socioA)} p={r.sAseat > 0 ? `sombrero ${fmtMXN(r.sAseat)}` : `socio ${P.split}%`} tip={`Todo lo que gana ${P.nombreA} en este proyecto: su utilidad de socio${r.sAseat > 0 ? " + lo que cobra por trabajarlo (sombrero)" : ""}.`} />
            <Tile k="k-b" l={r.sBseat > 0 ? `${P.nombreB} · trabaja` : P.nombreB} v={fmtMXN(r.socioB)} p={r.sBseat > 0 ? `sombrero ${fmtMXN(r.sBseat)}` : `socio ${100 - P.split}%`} tip={`Todo lo que gana ${P.nombreB} en este proyecto: su utilidad de socio${r.sBseat > 0 ? " + lo que cobra por trabajarlo (sombrero)" : ""}.`} />
            <Tile k="k-banca" l="A la Banca" v={fmtMXN(r.banca)} p="ahorro CURVA" tip="El colchón de ahorro de CURVA que genera este proyecto (caja de ahorro + descuentos de socio). No es de nadie: es la reserva de la empresa." />
          </div>
          <div className="card">
            <h2>A dónde va cada peso del ingreso</h2>
            <div className="stack">{segs.map((s) => <div key={s.k} className="seg" title={`${s.k} ${fmtMXN(s.v)}`} style={{ flex: `0 0 ${s.v / totSeg * 100}%`, background: `var(${s.c})` }} />)}</div>
            <div className="legend">{segs.map((s) => <span key={s.k} className="lg"><span className="dot" style={{ background: `var(${s.c})` }} /><span className="ln">{s.k}</span><span className="lv">{fmtMXN(s.v)}</span><span className="lp">{pctFmt(s.v / totSeg)}</span></span>)}</div>
          </div>
          <div className="two">
            <div className="card"><h2>El desglose</h2>
              {bd("", "Ingreso del proyecto", r.t)}{bd("sub", `− Equipo (${pctFmt(r.bolsaOut / (r.t || 1))} de este proyecto)`, -r.bolsaOut)}
              {r.comis > 0 && bd("sub", `− Comisión de origen ${r.comisBanca > 0 ? "→ Banca" : "→ " + (active.origenPersona || "quien lo trajo")}`, -r.comis)}
              {bd("sub", "− Caja del proyecto", -r.cajaProj)}{bd("eq", "CURVA se queda", r.marginOp)}{bd("sub", "− Caja de ahorro", -r.cajaAhorro)}
              {r.poolAmt > 0 && bd("sub", "− Bono del Núcleo", -r.poolAmt)}
              {bd("strong", "Utilidad a repartir", r.utilKept)}{bd("sub", `→ ${P.nombreA} ${P.split}%`, r.sAutil)}{bd("sub", `→ ${P.nombreB} ${100 - P.split}%`, r.sButil)}
            </div>
            <div className="stackcol">
              <div className="card"><h2>Cuánto cobra cada quien</h2><Rank rows={rows} /></div>
              <div className="card"><h2>Salud del ticket</h2>
                <div className="health">
                  <span className={"hpill " + (Math.abs(leak) < 1 ? "ok" : "bad")}>{Math.abs(leak) < 1 ? "Cuadra a $0" : "Descuadre"}</span>
                  <span className={"hpill " + (r.marginOp >= r.bolsaOut ? "ok" : "warn")}>{r.marginOp >= r.bolsaOut ? "CURVA ≥ equipo" : "Equipo se lleva más"}</span>
                  <span className={"hpill " + (mr >= 0.4 ? "ok" : mr >= 0.25 ? "warn" : "bad")}>{mr >= 0.4 ? "Sano" : mr >= 0.25 ? "Justo" : "Bajo"} ({pctFmt(mr)})</span>
                </div>
                <p className="foot"><b>Nota:</b> montos brutos. El neto real está en el Panel.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <RepartoMensual pr={membersResolved(active, st.roster, P)} P={P} />
    </>
  );
}

/* ---------------- Proyectos (control de pagos) ---------------- */
function Proyectos({ st, update, setActive }: { st: State; update: (fn: (s: State) => State) => void; setActive: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(st.activeId);
  const visibles = st.projects.filter((p) => !p.borrador);   // los borradores viven solo en la Calculadora
  const nuevo = () => { const nb = makeDraft(st.projects); update((s) => { s.projects = s.projects.filter((x) => !x.borrador); s.projects.push(nb); return s; }); setActive(nb.id); };
  return (
    <>
      <div className="page-h"><div><h1>Proyectos</h1><p>Registra cada pago que entra y te digo cuánto mandar a cada caja.</p></div><button className="btn primary" onClick={nuevo}><Plus size={15} /> Nuevo</button></div>
      <div className="proj-list rise">
        {visibles.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p className="hint" style={{ marginTop: 0 }}>Aún no guardas ningún proyecto. Ve a la <b>Calculadora</b>, arma uno y dale <b>Guardar proyecto</b>.</p>
          </div>
        )}
        {visibles.map((p) => (
          <ProyectoCard key={p.id} p={p} params={st.params} roster={st.roster} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} update={update} setActive={setActive} />
        ))}
      </div>
    </>
  );
}

function ProyectoCard({ p, params, roster, open, onToggle, update, setActive }: {
  p: Proyecto; params: Reglas; roster: RosterPerson[]; open: boolean; onToggle: () => void;
  update: (fn: (s: State) => State) => void; setActive: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [exported, setExported] = useState<Set<string>>(new Set()); // PDFs ya generados en esta sesión
  const R = reglasDe(p, params);   // foto congelada si está guardado; params vivos si no
  const pr = membersResolved(p, roster, R);
  const r = compute(pr, R);
  const gentePdf = Object.values(r.people)
    .filter((a) => a.trabajo + a.extra + (a.comision || 0) > 0.5)
    .sort((a, b) => (b.trabajo + b.extra + (b.comision || 0)) - (a.trabajo + a.extra + (a.comision || 0)) || order[a.quien] - order[b.quien]);
  const abrirPdf = (persona?: string) => window.open("/pdf/" + p.id + (persona ? "?persona=" + encodeURIComponent(persona) : ""), "_blank");
  const exportPersona = (persona: string) => { abrirPdf(persona); setExported((s) => new Set(s).add(persona)); };
  const pagos = p.pagos || [];
  const doDelete = () => update((s) => {
    s.projects = s.projects.filter((x) => x.id !== p.id);
    if (s.activeId === p.id) s.activeId = s.projects[0]?.id || "";
    return s;
  });
  const cobrado = pagos.reduce((a, x) => a + (+x.monto || 0), 0);
  const rec = pctRecibido(p);
  const estado: EstadoProyecto = p.estado ?? "cotizacion";
  const upP = (fn: (x: Proyecto) => void) => update((s) => { const x = s.projects.find((y) => y.id === p.id); if (x) fn(x); return s; });

  return (
    <div className={"pcard" + (open ? " open" : "")}>
      <div className="pcard-head" onClick={onToggle}>
        <span className="pcard-chev">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        <div className="pcard-title">
          <div className="gn">{p.nombre} <span className={"est est-" + estado}>{ESTADO_LABEL[estado]}</span></div>
          <div className="gt">{p.tipo} · {p.members.length} pers. · {p.conIVA ? "con IVA" : "sin IVA"} · {(p.modoCobro ?? "golpe") === "mensual" ? `mensual ${p.plazoMeses}m` : "de golpe"}{p.clienteNombre ? " · " + p.clienteNombre : ""}</div>
        </div>
        <div className="pcard-right">
          <div className="gv">{fmtMXN(r.t)}</div>
          <div className="gm">{pctFmt(rec)} cobrado</div>
        </div>
        {!confirmDel ? (
          <button className="pcard-del" title="Borrar proyecto" onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }}><Trash2 size={16} /></button>
        ) : (
          <span className="pcard-delc" onClick={(e) => e.stopPropagation()}>
            <span className="reset-q"><AlertTriangle size={13} /> ¿Borrar{pagos.length ? ` (${pagos.length} pago${pagos.length !== 1 ? "s" : ""})` : ""}?</span>
            <button className="btn danger" onClick={(e) => { e.stopPropagation(); doDelete(); }}>Sí</button>
            <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setConfirmDel(false); }}>No</button>
          </span>
        )}
      </div>
      <div className="pcard-prog"><i style={{ width: Math.min(100, rec * 100) + "%" }} /></div>

      {open && (
        <div className="pcard-body">
          <div className="pcard-actions">
            <button className="btn ghost" onClick={() => setActive(p.id)}><Calculator size={14} /> Editar</button>
            <button className="btn ghost" onClick={() => setPdfOpen(true)}><FileText size={14} /> PDF de reparto</button>
            <button className="btn ghost" onClick={() => window.open("/pdf/banco?proyecto=" + p.id, "_blank")}><Wallet size={14} /> Datos para cobro</button>
            <div className="est-chips">
              {(["cotizacion", "activo", "cerrado", "cancelado"] as EstadoProyecto[]).map((e) => (
                <button key={e} className="chip-btn sm" aria-pressed={estado === e} onClick={() => upP((x) => { x.estado = e; })}>{ESTADO_LABEL[e]}</button>
              ))}
            </div>
          </div>

          <div className="pay-cols">
            <div>
              <h3 className="pay-h">Registrar un pago</h3>
              <PagoForm ticket={r.t} conIVA={!!p.conIVA} cobrado={cobrado}
                onAdd={(pago) => upP((x) => { x.pagos = [...(x.pagos || []), pago]; if (x.estado === "cotizacion") x.estado = "activo"; })} />
              <p className="hint">Cobrado: <b>{fmtMXN(cobrado)}</b> de {fmtMXN(r.t)} · falta <b>{fmtMXN(Math.max(0, r.t - cobrado))}</b>{p.conIVA ? ` (sin IVA; con IVA el total es ${fmtMXN(totalCliente(p))})` : ""}.</p>
            </div>
            <div>
              <h3 className="pay-h">Pagos registrados</h3>
              {pagos.length === 0 && <div className="hint">Aún no registras pagos. Cuando entre el anticipo, regístralo y te digo cómo repartirlo.</div>}
              {pagos.map((pago, idx) => (
                <PagoRow key={pago.id} p={pr} params={R} idx={idx} pago={pago}
                  onToggleDesemb={() => upP((x) => { const g = (x.pagos || [])[idx]; if (g) g.desembolsado = !g.desembolsado; })}
                  onDelete={() => upP((x) => { x.pagos = (x.pagos || []).filter((_, i) => i !== idx); })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {pdfOpen && (
        <div className="pdf-modal-bg" onClick={() => setPdfOpen(false)}>
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-h">
              <div><b>Exportar PDF · {p.nombre}</b><div className="hint" style={{ margin: "2px 0 0" }}>Uno por persona. A quien no es socio no le aparece cuánto costó el proyecto.</div></div>
              <button className="rmv" onClick={() => setPdfOpen(false)}>×</button>
            </div>
            <div className="pdf-modal-list">
              {gentePdf.map((a) => {
                const comis = a.comision || 0; const base = a.trabajo + a.extra;
                const ya = exported.has(a.nombre);
                return (
                  <div key={a.nombre} className={"pdf-mr" + (ya ? " done" : "")}>
                    <span className="pdf-mr-who"><span className="nm">{a.nombre}</span><span className={"badge " + badgeCls[a.quien]}>{badgeTxt[a.quien]}</span></span>
                    <span className="pdf-mr-v">{fmtMXN(base + comis)}{comis > 0.5 && <span className="pdf-mr-comis">{fmtMXN(base)} + {fmtMXN(comis)} comisión</span>}</span>
                    <button className={"btn sm " + (ya ? "ok-btn" : "primary")} onClick={() => exportPersona(a.nombre)}>{ya ? <><Check size={13} /> Bajado</> : <><FileText size={13} /> PDF</>}</button>
                  </div>
                );
              })}
            </div>
            <button className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => abrirPdf()}>Abrir todos juntos (solo para ti)</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PagoForm({ ticket, conIVA, cobrado, onAdd }: { ticket: number; conIVA: boolean; cobrado: number; onAdd: (p: Pago) => void }) {
  const [monto, setMonto] = useState<number>(0);
  const [fecha, setFecha] = useState<string>(todayISO());
  const [nota, setNota] = useState<string>("");
  const falta = Math.max(0, ticket - cobrado);
  const quick = (frac: number) => setMonto(Math.round(ticket * frac));
  const add = () => {
    if (monto <= 0) return;
    onAdd({ id: uid(), fecha, monto: Math.round(monto), nota: nota.trim() || undefined, ivaCobrado: conIVA ? Math.round(monto * IVA) : undefined, desembolsado: false });
    setMonto(0); setNota("");
  };
  return (
    <div className="pay-form">
      <div className="field" style={{ margin: 0 }}><label>¿Cuánto entró? (sin IVA)</label>
        <div className="money-in"><span>$</span><input type="number" value={monto || ""} placeholder="0" onChange={(e) => setMonto(+e.target.value || 0)} /></div>
      </div>
      <div className="chips-loose" style={{ marginTop: 8 }}>
        <button className="chip-btn sm" onClick={() => quick(0.5)}>50%</button>
        <button className="chip-btn sm" onClick={() => quick(0.6)}>60%</button>
        <button className="chip-btn sm" onClick={() => setMonto(Math.round(falta))}>Lo que falta</button>
      </div>
      <div className="two" style={{ gap: 10, marginTop: 8 }}>
        <div className="field" style={{ margin: 0 }}><label>Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Nota</label><input type="text" placeholder="Anticipo 60%" value={nota} onChange={(e) => setNota(e.target.value)} /></div>
      </div>
      {conIVA && monto > 0 && <p className="hint">El cliente te transfiere {fmtMXN(monto * (1 + IVA))} (con IVA); registras {fmtMXN(monto)}.</p>}
      <button className="btn primary" style={{ width: "100%", marginTop: 10 }} disabled={monto <= 0} onClick={add}><Plus size={15} /> Registrar y calcular reparto</button>
    </div>
  );
}

function PagoRow({ p, params, idx, pago, onToggleDesemb, onDelete }: {
  p: Proyecto; params: Reglas; idx: number; pago: Pago; onToggleDesemb: () => void; onDelete: () => void;
}) {
  const d = desembolsoDePago(p, params, idx);
  const cajas = agrupaCajas(d.movimientos, params);
  return (
    <div className={"pago" + (pago.desembolsado ? " done" : "")}>
      <div className="pago-head">
        <div>
          <b>{fmtMXN(pago.monto)}</b> <span className="hint" style={{ margin: 0 }}>· {pago.fecha}{pago.nota ? " · " + pago.nota : ""}</span>
        </div>
        <button className="rmv" onClick={onDelete} title="Borrar pago">×</button>
      </div>
      <div className="desemb">
        <div className="desemb-h"><Wallet size={13} /> Reparte este pago en tus cajas de Revolut:</div>
        {cajas.map((c) => <CajaLine key={c.caja} c={c} />)}
      </div>
      <button className={"btn " + (pago.desembolsado ? "ok-btn" : "primary")} style={{ width: "100%", marginTop: 8 }} onClick={onToggleDesemb}>
        {pago.desembolsado ? <><Check size={14} /> Guardado en cajas</> : "Marcar: guardado en cajas"}
      </button>
    </div>
  );
}

// Una caja en la tarjeta de desembolso. La Masa salarial se despliega para ver
// cuánto se suma de cada persona (sueldo) y las comisiones.
function CajaLine({ c }: { c: CajaGrupo }) {
  const [open, setOpen] = useState(false);
  const desglosable = c.caja === "masaSalarial" && c.detalle.length > 0;
  return (
    <div className={"cja" + (open ? " open" : "")}>
      <div className={"cja-head" + (desglosable ? " tapp" : "")} onClick={desglosable ? () => setOpen(!open) : undefined}>
        <span className="mv-dot" style={{ background: `var(${cajaKindColor[c.caja]})` }} />
        <span className="mv-l">{c.label}{desglosable && <span className="cja-n"> · {c.detalle.length}</span>}</span>
        {desglosable && <span className="cja-chev">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
        <span className="mv-v">{fmtMXN(c.total)}</span>
      </div>
      {open && desglosable && (
        <div className="cja-det">
          {c.detalle.map((dt, i) => (
            <div key={i} className="cja-dr">
              <span className="cja-dn">{dt.nombre}{dt.concepto !== "sueldo" && <span className={"cja-tag " + (dt.concepto === "comisión" ? "t-comis" : "t-bono")}>{dt.concepto}</span>}</span>
              <span className="cja-dv">{fmtMXN(dt.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Cajas (tesorería) ---------------- */
// Lo que le debes a una persona del equipo, sumado sobre todos los proyectos.
type Deuda = {
  nombre: string; quien: Quien;
  listo: number;   // proyectos 100% liquidados y en caja → transferir ya
  acum: number;    // dinero ya guardado pero el proyecto aún no liquida
  listos: { id: string; nombre: string; monto: number }[];
  acums: { id: string; nombre: string; monto: number; rec: number }[];
};

function Cajas({ st, update, setSec }: { st: State; update: (fn: (s: State) => State) => void; setSec: (s: string) => void }) {
  const P = st.params;
  const proyectos = st.projects.filter((p) => !p.borrador);
  const [editSaldos, setEditSaldos] = useState(false);
  const semillas = mergeSaldos(st.saldosIniciales); // saldo que ya tenías antes de la app
  const setSeed = (c: CajaKind, v: number) => update((s) => { s.saldosIniciales = { ...mergeSaldos(s.saldosIniciales), [c]: v }; return s; });

  const saldos: Record<CajaKind, number> = { masaSalarial: 0, socioA: 0, socioB: 0, cajaProyecto: 0, cajaAhorro: 0, banca: 0 };
  const deudas: Record<string, Deuda> = {};
  const pagadosMap: Record<string, { nombre: string; quien: Quien; monto: number; fecha: string }> = {};
  const avisos: { id: string; nombre: string; monto: number }[] = [];

  proyectos.forEach((p) => {
    const R = reglasDe(p, P);        // foto congelada del proyecto guardado
    const pr = membersResolved(p, st.roster, R);
    const r = compute(pr, R);
    const ticket = r.t; if (ticket <= 0) return;
    const pagos = p.pagos || [];
    const cobrado = pagos.reduce((a, x) => a + (+x.monto || 0), 0);
    const enCaja = pagos.filter((x) => x.desembolsado).reduce((a, x) => a + (+x.monto || 0), 0);
    const enCajaPct = Math.min(1, enCaja / ticket);
    const rec = Math.min(1, cobrado / ticket);
    const liquidado = rec >= 0.999;
    const todoEnCaja = pagos.length > 0 && pagos.every((x) => x.desembolsado);
    const listoProj = liquidado && todoEnCaja;

    // Saldos de las cajas que NO son masa salarial (socios / proyecto / ahorro / banca).
    if (enCajaPct > 0) {
      const agg = desembolso(pr, R, { pctPrev: 0, pctAcum: enCajaPct });
      agrupaCajas(agg.movimientos, R).forEach((g) => { if (g.caja !== "masaSalarial") saldos[g.caja] += g.total; });
    }

    // Ledger de la masa salarial → equipo (persona por persona).
    let equipoListo = 0;
    Object.values(r.people).forEach((per) => {
      if (isSocio(per.quien)) return;               // el dinero de los socios es suyo, no se adeuda
      const cut = per.trabajo + per.extra + (per.comision || 0);
      if (cut <= 0.5) return;
      const key = per.nombre;
      const yaPagado = !!p.equipoPagado?.[per.nombre];
      if (yaPagado) {
        const f = p.equipoPagado![per.nombre];
        if (!pagadosMap[key]) pagadosMap[key] = { nombre: per.nombre, quien: per.quien, monto: 0, fecha: f };
        pagadosMap[key].monto += cut; if (f > pagadosMap[key].fecha) pagadosMap[key].fecha = f;
        return;
      }
      if (!deudas[key]) deudas[key] = { nombre: per.nombre, quien: per.quien, listo: 0, acum: 0, listos: [], acums: [] };
      const enCajaPersona = cut * enCajaPct;
      saldos.masaSalarial += enCajaPersona;         // sigue parqueado en la masa salarial
      if (listoProj) { deudas[key].listo += cut; deudas[key].listos.push({ id: p.id, nombre: p.nombre, monto: cut }); equipoListo += cut; }
      else if (enCajaPersona > 0.5) { deudas[key].acum += enCajaPersona; deudas[key].acums.push({ id: p.id, nombre: p.nombre, monto: enCajaPersona, rec }); }
    });
    if (listoProj && equipoListo > 0.5) avisos.push({ id: p.id, nombre: p.nombre, monto: equipoListo });
  });

  const filas = Object.values(deudas).filter((d) => d.listo + d.acum > 0.5).sort((a, b) => (b.listo + b.acum) - (a.listo + a.acum) || order[a.quien] - order[b.quien]);
  const pagados = Object.values(pagadosMap).sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  const totalListo = filas.reduce((a, d) => a + d.listo, 0);
  const totalAcum = filas.reduce((a, d) => a + d.acum, 0);
  const hayPagos = proyectos.some((p) => (p.pagos || []).length > 0);

  const pagarPersona = (nombre: string, ids: string[]) => update((s) => {
    ids.forEach((id) => { const p = s.projects.find((x) => x.id === id); if (p) p.equipoPagado = { ...(p.equipoPagado || {}), [nombre]: todayISO() }; });
    return s;
  });
  const deshacer = (nombre: string) => update((s) => {
    s.projects.forEach((p) => { if (p.equipoPagado && p.equipoPagado[nombre]) { const e = { ...p.equipoPagado }; delete e[nombre]; p.equipoPagado = e; } });
    return s;
  });

  return (
    <>
      <div className="page-h"><div><h1>Cajas</h1><p>Tus cuentas de Revolut y a quién le debes de la masa salarial. Al equipo se le paga cuando su proyecto ya quedó 100% liquidado.</p></div></div>

      <div className="rise">
        {avisos.map((a) => (
          <div key={a.id} className="alert ok" style={{ marginBottom: 10 }}><Check size={15} /> <b>{a.nombre}</b> quedó 100% liquidado — ya puedes transferir {fmtMXN(a.monto)} al equipo.</div>
        ))}

        <div className="card">
          <div className="tes-h">
            <h2 style={{ margin: 0 }}>Lo que hay en cada caja</h2>
            <button className="deuda-toggle" onClick={() => setEditSaldos(!editSaldos)}>{editSaldos ? "listo" : "ajustar saldo que ya tenías"}</button>
          </div>
          <p className="hint" style={{ marginTop: -4 }}>Lo que ya tenías + todo lo “guardado en cajas”, menos lo que ya le transferiste al equipo.</p>
          <div className="caja-grid">
            {CAJA_ORDER.map((c) => (
              <div key={c} className="caja-t">
                <span className="caja-dot" style={{ background: `var(${cajaKindColor[c]})` }} />
                <div className="caja-l">{cajaLabel(c, P)}</div>
                <div className="caja-v">{fmtMXN(saldos[c] + semillas[c])}</div>
                {semillas[c] > 0.5 && !editSaldos && <div className="caja-seed">incl. {fmtMXN(semillas[c])} inicial</div>}
                {editSaldos && (
                  <div className="caja-edit">
                    <span className="caja-edit-l">Saldo inicial</span>
                    <div className="money-in sm"><span>$</span><input type="number" step="0.01" value={semillas[c] || ""} placeholder="0" onChange={(e) => setSeed(c, +e.target.value || 0)} /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {editSaldos && <p className="hint" style={{ marginBottom: 0 }}>Captura lo que YA tenías en cada cuenta de Revolut antes de usar la app. Se suma a lo que la app calcula.</p>}
        </div>

        <div className="card">
          <div className="tes-h">
            <h2 style={{ margin: 0 }}>Masa salarial → equipo</h2>
            <div className="tes-sum"><span className="tes-listo">{fmtMXN(totalListo)} por pagar</span>{totalAcum > 0.5 && <span className="tes-acum">+ {fmtMXN(totalAcum)} acumulando</span>}</div>
          </div>
          {!hayPagos && <div className="hint">Aún no hay pagos. Registra un cobro en <b style={{ cursor: "pointer", color: "var(--cobalt)" }} onClick={() => setSec("proyectos")}>Proyectos</b> y aquí verás a quién le debes.</div>}
          {hayPagos && filas.length === 0 && <div className="hint">Nadie del equipo tiene saldo pendiente ahora mismo.</div>}
          {filas.map((d) => <DeudaRow key={d.nombre} d={d} onPagar={() => pagarPersona(d.nombre, d.listos.map((x) => x.id))} />)}
          {pagados.length > 0 && <PagadosLista pagados={pagados} onDeshacer={deshacer} />}
        </div>
      </div>
    </>
  );
}

function DeudaRow({ d, onPagar }: { d: Deuda; onPagar: () => void }) {
  const [open, setOpen] = useState(false);
  const n = d.listos.length + d.acums.length;
  return (
    <div className="deuda">
      <div className="deuda-main">
        <div className="deuda-who"><span className="nm">{d.nombre}</span><span className={"badge " + badgeCls[d.quien]}>{badgeTxt[d.quien]}</span></div>
        <div className="deuda-nums">
          {d.listo > 0.5 && <span className="d-listo">{fmtMXN(d.listo)} listo</span>}
          {d.acum > 0.5 && <span className="d-acum">{fmtMXN(d.acum)} acumulando</span>}
        </div>
        {d.listo > 0.5
          ? <button className="btn primary sm" onClick={onPagar}><ArrowRight size={13} /> Transferir</button>
          : <span className="d-wait">esperando liquidar</span>}
      </div>
      {n > 0 && <button className="deuda-toggle" onClick={() => setOpen(!open)}>{open ? "ocultar" : "ver de qué proyectos"} ({n})</button>}
      {open && (
        <div className="deuda-det">
          {d.listos.map((x, i) => <div key={"l" + i} className="dd"><span className="dd-dot ok" /> {x.nombre}<span className="dd-v">{fmtMXN(x.monto)}</span></div>)}
          {d.acums.map((x, i) => <div key={"a" + i} className="dd"><span className="dd-dot wait" /> {x.nombre} <span className="dd-pct">{pctFmt(x.rec)} cobrado</span><span className="dd-v">{fmtMXN(x.monto)}</span></div>)}
        </div>
      )}
    </div>
  );
}

function PagadosLista({ pagados, onDeshacer }: { pagados: { nombre: string; quien: Quien; monto: number; fecha: string }[]; onDeshacer: (nombre: string) => void }) {
  const [open, setOpen] = useState(false);
  const total = pagados.reduce((a, x) => a + x.monto, 0);
  return (
    <div className="pagados">
      <button className="pagados-h" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Ya transferidos · {pagados.length} · {fmtMXN(total)}
      </button>
      {open && pagados.map((x) => (
        <div key={x.nombre} className="pagados-r">
          <Check size={13} /> <span className="pg-n">{x.nombre}</span><span className="pg-f">{x.fecha}</span><span className="pg-v">{fmtMXN(x.monto)}</span>
          <button className="pg-undo" title="Deshacer (marcar como no pagado)" onClick={() => onDeshacer(x.nombre)}><RotateCcw size={12} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Facturas (la estrella) ---------------- */
type FacturaData = { proveedor: string; concepto: string; subtotal: number | null; iva: number | null; total: number; moneda: string; fecha: string | null; rfc_emisor: string | null; categoria_sugerida: "overhead" | "proyecto"; razon_categoria: string };

function Facturas({ st, clientes, update }: { st: State; clientes: Cliente[]; update: (fn: (s: State) => State) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "xml">("image");
  const [data, setData] = useState<FacturaData | null>(null);
  const [over, setOver] = useState(false);
  const [clase, setClase] = useState<"gasto" | "ingreso">("gasto");
  const [dest, setDest] = useState<{ tipo: "overhead" | "proyecto"; proyectoId: string }>({ tipo: "overhead", proyectoId: "" });
  const [ingProy, setIngProy] = useState("");
  const [saved, setSaved] = useState(false);

  const send = useCallback(async (payload: object) => {
    setBusy(true);
    try {
      const res = await fetch("/api/facturas/analizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!d.ok) { setErr(d.error || "No se pudo analizar la factura"); return; }
      setData(d.factura);
      setDest({ tipo: d.factura.categoria_sugerida, proyectoId: "" });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);

  const analyze = useCallback((file: File) => {
    setErr(null); setData(null); setSaved(false);
    const isXml = file.name.toLowerCase().endsWith(".xml") || file.type.includes("xml");
    const reader = new FileReader();
    if (isXml) {
      reader.onload = () => { setPreview(file.name); setPreviewKind("xml"); send({ xml: reader.result as string }); };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl); setPreviewKind("image");
        send({ imageBase64: dataUrl.split(",")[1], mediaType: file.type || "image/jpeg" });
      };
      reader.readAsDataURL(file);
    }
  }, [send]);

  const guardar = () => {
    if (!data) return;
    if (clase === "ingreso") {
      const base = Math.round(data.subtotal ?? data.total);   // el modelo reparte SIN IVA
      update((s) => {
        const proj = s.projects.find((p) => p.id === ingProy);
        if (!proj) return s;
        proj.pagos = [...(proj.pagos || []), {
          id: uid(), fecha: data.fecha || todayISO(), monto: base,
          ivaCobrado: data.iva ?? undefined, nota: `Factura · ${data.proveedor}`.slice(0, 50),
          facturaRef: data.rfc_emisor || data.proveedor, desembolsado: false,
        }];
        if ((proj.estado ?? "cotizacion") === "cotizacion") proj.estado = "activo";
        return s;
      });
      setSaved(true);
      return;
    }
    const proj = dest.tipo === "proyecto" ? st.projects.find((p) => p.id === dest.proyectoId) : null;
    update((s) => {
      s.gastos.push({ n: `${data.proveedor} · ${data.concepto}`.slice(0, 60), m: Math.round(data.total), proveedor: data.proveedor, fecha: data.fecha, proyectoId: proj?.id || null });
      return s;
    });
    setSaved(true);
  };

  return (
    <>
      <div className="page-h"><div><h1>Facturas</h1><p>Sube el XML (CFDI), lo leo gratis y exacto. Si es <b>ingreso</b> lo registro como pago del proyecto; si es <b>gasto</b>, al overhead o a la caja de un proyecto.</p></div></div>
      <div className="two">
        <div className="card">
          <h2>Subir factura</h2>
          {!preview ? (
            <label className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) analyze(f); }}>
              <UploadCloud /><b>Arrastra el XML (CFDI) de la factura</b><span>o haz clic para elegir · gratis y exacto · .xml</span>
              <input type="file" accept=".xml,application/xml,text/xml,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); }} />
            </label>
          ) : previewKind === "image" ? (
            <div>
              <img src={preview} alt="factura" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", maxHeight: 340, objectFit: "contain", background: "var(--panel-2)" }} />
              <button className="btn" style={{ marginTop: 12 }} onClick={() => { setPreview(null); setData(null); setErr(null); setSaved(false); }}>Otra factura</button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)" }}>
                <Receipt /><div><b>{preview}</b><div className="hint" style={{ margin: 0 }}>CFDI leído gratis · sin IA</div></div>
              </div>
              <button className="btn" style={{ marginTop: 12 }} onClick={() => { setPreview(null); setData(null); setErr(null); setSaved(false); }}>Otra factura</button>
            </div>
          )}
          {busy && <div style={{ textAlign: "center", padding: 24 }}><div className="spinner" /><p className="hint" style={{ textAlign: "center" }}>Leyendo la factura…</p></div>}
          {err && <div className="alert warn" style={{ marginTop: 12 }}>{err}</div>}
        </div>

        <div className="card">
          <h2>Lo que leí</h2>
          {!data && !busy && <div className="hint">Sube una factura y aquí aparecen los datos extraídos para que confirmes.</div>}
          {data && (
            <>
              <div className="fact-grid" style={{ marginBottom: 14 }}>
                <Field l="Proveedor" v={data.proveedor} />
                <Field l="Total" v={fmtMXN(data.total)} strong />
                <Field l="Concepto" v={data.concepto} />
                <Field l="Fecha" v={data.fecha || "—"} />
                <Field l="IVA" v={data.iva != null ? fmtMXN(data.iva) : "—"} />
                <Field l="RFC emisor" v={data.rfc_emisor || "—"} />
              </div>
              <div className="field"><label>¿Qué es esta factura?</label>
                <div className="chips">
                  <button className="chip-btn" aria-pressed={clase === "ingreso"} onClick={() => { setClase("ingreso"); setSaved(false); }}>Ingreso</button>
                  <button className="chip-btn" aria-pressed={clase === "gasto"} onClick={() => { setClase("gasto"); setSaved(false); }}>Gasto</button>
                </div>
              </div>

              {clase === "ingreso" ? (
                <>
                  <div className="field"><label>¿De qué proyecto es este cobro?</label>
                    <select value={ingProy} onChange={(e) => setIngProy(e.target.value)}>
                      <option value="">— elige —</option>
                      {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.clienteNombre ? ` · ${p.clienteNombre}` : ""}</option>)}
                    </select>
                    <p className="hint">Se registra como un pago de {fmtMXN(Math.round(data.subtotal ?? data.total))} (sin IVA) y te digo cómo repartirlo en Proyectos.</p>
                  </div>
                  {saved ? (
                    <div className="alert ok" style={{ marginTop: 4 }}><Check size={16} /> Ingreso registrado como pago. Ve a Proyectos para el reparto.</div>
                  ) : (
                    <button className="btn primary" style={{ width: "100%", marginTop: 4 }} disabled={!ingProy} onClick={guardar}>Registrar ingreso en el proyecto</button>
                  )}
                </>
              ) : (
                <>
                  <div className="field"><label>¿A dónde va este gasto?</label>
                    <div className="chips">
                      <button className="chip-btn" aria-pressed={dest.tipo === "overhead"} onClick={() => setDest((d) => ({ ...d, tipo: "overhead" }))}>Overhead</button>
                      <button className="chip-btn" aria-pressed={dest.tipo === "proyecto"} onClick={() => setDest((d) => ({ ...d, tipo: "proyecto" }))}>Caja de proyecto</button>
                    </div>
                    <p className="hint">Sugerencia: <b>{data.categoria_sugerida}</b> — {data.razon_categoria}</p>
                  </div>
                  {dest.tipo === "proyecto" && (
                    <div className="field"><label>¿Qué proyecto?</label>
                      <select value={dest.proyectoId} onChange={(e) => setDest((d) => ({ ...d, proyectoId: e.target.value }))}>
                        <option value="">— elige —</option>
                        {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.clienteNombre ? ` · ${p.clienteNombre}` : ""}</option>)}
                      </select>
                      {clientes.length > 0 && <p className="hint">Los proyectos se ligan a clientes de tu CRM de Notion.</p>}
                    </div>
                  )}
                  {saved ? (
                    <div className="alert ok" style={{ marginTop: 4 }}><Check size={16} /> Gasto guardado. Ya cuenta en el Panel.</div>
                  ) : (
                    <button className="btn primary" style={{ width: "100%", marginTop: 4 }} disabled={dest.tipo === "proyecto" && !dest.proyectoId} onClick={guardar}>Guardar gasto</button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Reglas (el tablero de control — paridad con la hoja Parámetros) ---------------- */
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const valStyle: CSSProperties = { fontFamily: "var(--mono)", fontWeight: 700, color: "var(--cobalt)", minWidth: 52, textAlign: "right" };
const numInput: CSSProperties = { flex: 1.3, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 };

function ReglasView({ st, update }: { st: State; update: (fn: (s: State) => State) => void }) {
  const P = st.params;
  const [confirmReset, setConfirmReset] = useState(false);
  // ¿Hay algo cambiado respecto a los valores por defecto? (para avisar y habilitar el reset)
  const modificado = (Object.keys(REGLAS_DEFAULT) as (keyof Reglas)[]).some((k) => P[k] !== REGLAS_DEFAULT[k]);
  const doReset = () => { update((s) => { s.params = { ...REGLAS_DEFAULT }; return s; }); setConfirmReset(false); };
  const setN = (k: keyof Reglas, v: number) => update((s) => { (s.params[k] as number) = v; return s; });
  const setS = (k: keyof Reglas, v: string) => update((s) => { (s.params[k] as string) = v; return s; });
  const setRoster = (id: string, fn: (r: RosterPerson) => void) => update((s) => { const r = s.roster.find((x) => x.id === id); if (r) fn(r); return s; });
  const addRoster = () => update((s) => { s.roster.push({ id: uid(), nombre: "Nueva persona", quien: "nucleo" }); return s; });
  const rmRoster = (id: string) => update((s) => { s.roster = s.roster.filter((x) => x.id !== id); return s; });

  // Slider en % (0–100)
  const pct = (k: keyof Reglas, label: string, min: number, max: number, step = 1) => (
    <div className="field" style={rowStyle}>
      <label style={{ margin: 0, flex: 1 }}>{label}</label>
      <input style={{ flex: 1.3 }} type="range" min={min} max={max} step={step} value={P[k] as number} onChange={(e) => setN(k, +e.target.value)} />
      <span style={valStyle}>{P[k] as number}%</span>
    </div>
  );
  // Monto en $
  const money = (k: keyof Reglas, label: string) => (
    <div className="field" style={rowStyle}>
      <label style={{ margin: 0, flex: 1 }}>{label}</label>
      <div className="money-in" style={{ flex: 1.3 }}><span>$</span><input type="number" min={0} step={500} value={P[k] as number} onChange={(e) => setN(k, +e.target.value || 0)} /></div>
    </div>
  );
  // Multiplicador (peso o seniority)
  const mult = (k: keyof Reglas, label: string) => (
    <div className="field" style={rowStyle}>
      <label style={{ margin: 0, flex: 1 }}>{label}</label>
      <input style={numInput} type="number" min={0} step={0.1} value={P[k] as number} onChange={(e) => setN(k, +e.target.value || 0)} />
      <span style={{ ...valStyle, minWidth: 20 }}>×</span>
    </div>
  );
  // Texto (nombres)
  const text = (k: keyof Reglas, label: string) => (
    <div className="field" style={rowStyle}>
      <label style={{ margin: 0, flex: 1 }}>{label}</label>
      <input style={{ flex: 1.3 }} type="text" value={P[k] as string} onChange={(e) => setS(k, e.target.value)} />
    </div>
  );

  return (
    <>
      <div className="page-h"><div><h1>Reglas de CURVA</h1><p>El tablero de control del modelo. Mueve cualquier perilla — se guarda solo y se recalcula todo.</p></div></div>

      <div className="two">
        <div className="card"><h2>Compensación</h2>
          {pct("alpha", "Cuánto cobra un socio de su trabajo", 0, 100, 5)}
          <p className="hint" style={{ marginTop: -2 }}>Cuando tú o Balmo trabajan un proyecto, cobran este % de su tarifa; el resto ({100 - P.alpha}%) se guarda en la Banca (tu ahorro). No cambia lo que gana CURVA — solo mueve tu dinero: <b>bolsa hoy vs. ahorro</b>. No diluye al otro socio.</p>
          {pct("beta", "β — barrer utilidad a la Banca", 0, 50, 5)}
          {pct("split", `Reparto ${P.nombreA} (resto ${P.nombreB})`, 50, 80)}
          {pct("ahorro", "Caja de ahorro (% del margen op.)", 0, 25)}
          {pct("imp", "ISR / impuesto (% que reservas)", 0, 20, 0.5)}
          <p className="hint" style={{ marginTop: -2 }}>El % que apartas para el SAT — solo para ver el <b>neto</b> real (no mueve el reparto). En <b>RESICO</b> Persona Física el ISR va por tramos ~1.0–2.5% del ingreso mensual; arranca en <b>2.5%</b> (el tope, colchón conservador). <b>Confírmalo con tu contadora.</b></p>
        </div>
        <div className="card"><h2>Comisión de origen</h2>
          {pct("comisPct", "% del margen a quien trae el lead", 0, 25)}
          {money("comisTope", "Tope de la comisión")}
          <p className="foot">Solo aplica al primer módulo (exploración). Los leads rápidos van sin comisión. Por proyecto decides si aplica y si va a Banca o al equipo.</p>
        </div>
      </div>

      <div className="card"><h2>Pesos de rol</h2>
        <p className="hint" style={{ marginTop: 0 }}>Qué tanto se lleva cada sombrero, comparado con los demás. Lo que cuenta es la proporción entre roles, no el número: un Piloto (1.8) se lleva casi el doble que un Apoyo (1.0).</p>
        <div className="two" style={{ marginTop: 4 }}>
          <div>
            {mult("pesoP", "Piloto")}
            {mult("pesoE", "Especialista")}
          </div>
          <div>
            {mult("pesoA", "Apoyo")}
          </div>
        </div>
      </div>

      <div className="card"><h2>% de equipo según el tamaño del ticket</h2>
        <p className="hint" style={{ marginTop: 0 }}>Funciona por tramos (como los impuestos): los primeros pesos pagan más equipo, los siguientes menos. Así CURVA se queda con más en proyectos grandes, <b>y vender más caro siempre paga más</b> (sin saltos raros). Probado con 5,000 escenarios: 0 fugas.</p>
        <div className="two" style={{ marginTop: 4 }}>
          <div>
            {pct("brkChico", "Tramo chico (≤ umbral 1)", 0, 60)}
            {pct("brkMediano", "Tramo mediano (umbral 1–2)", 0, 60)}
            {pct("brkGrande", "Tramo grande (umbral 2–3)", 0, 60)}
            {pct("brkTope", "Tramo muy grande (> umbral 3)", 0, 60)}
          </div>
          <div>
            {money("umbral1", "Umbral 1")}
            {money("umbral2", "Umbral 2")}
            {money("umbral3", "Umbral 3")}
          </div>
        </div>
      </div>

      <div className="two">
        <div className="card"><h2>Banca y seniority</h2>
          {mult("smNuevo", "Seniority de un integrante nuevo")}
          {money("metaBancaMonto", "Meta de la Banca (colchón)")}
          <p className="foot">El colchón de emergencia de CURVA y el trampolín para pasar a alguien a nómina. Sugerido ~$48k (1 nómina medio año). Súbelo cuando crezcan.</p>
        </div>
        <div className="card"><h2>Nombres de los socios</h2>
          {text("nombreA", "Socio A")}
          {text("nombreB", "Socio B")}
          <p className="foot">Se usan en todo: calculadora, panel y reparto. (En el Excel el Socio A decía “Oliab”; aquí es {P.nombreA}.)</p>
        </div>
      </div>

      <div className="card"><h2>Personas del equipo</h2>
        <p className="hint" style={{ marginTop: 0 }}>El directorio del equipo. Defines a cada persona <b>una vez</b> y la eliges en cualquier proyecto sin volver a escribir su nombre. Los socios ({P.nombreA} y {P.nombreB}) ya están arriba, no van aquí.</p>
        {st.roster.map((rp) => (
          <div className="member" key={rp.id} style={{ gridTemplateColumns: "1.5fr 1.2fr auto" }}>
            <input type="text" value={rp.nombre} placeholder="Nombre" onChange={(e) => setRoster(rp.id, (r) => { r.nombre = e.target.value; })} />
            <div className="chips">
              {(["nucleo", "nuevo"] as Quien[]).map((q) => (
                <button key={q} className="chip-btn" aria-pressed={rp.quien === q} onClick={() => setRoster(rp.id, (r) => { r.quien = q; })}>{q === "nucleo" ? "Núcleo" : "Nuevo"}</button>
              ))}
            </div>
            <button className="rmv" onClick={() => rmRoster(rp.id)}>×</button>
          </div>
        ))}
        <button className="add" onClick={addRoster}>+ Agregar persona al equipo</button>
        <p className="foot"><b>Núcleo</b> = gente de planta (cobra completo). <b>Nuevo</b> = junior en formación (cobra ×{P.smNuevo} mientras sube). Renombrar aquí actualiza a esa persona en todos los proyectos.</p>
      </div>

      <div className="card" style={{ borderStyle: "dashed", opacity: 0.95 }}>
        <h2>A futuro — aún no activo</h2>
        <p className="hint" style={{ marginTop: 0 }}>Cosas que el modelo puede hacer, pero que <b>hoy dejamos apagadas</b> para salir e ir iterando sin prometer de más. Préndelas cuando estén seguros.</p>
        {pct("pool", "Bono del Núcleo — % de la ganancia repartido al equipo de planta", 0, 25)}
        <p className="foot">Es un extra para la gente de planta (Ivana, Lomba, Yannick, Diana) además de su pago por trabajo. Se prende cuando tengan un Núcleo fijo y la Banca lo aguante. Hoy en <b>0%</b> = no reparte bono.</p>
      </div>

      <div className="card reset-card">
        <div className="reset-row">
          <div>
            <h2 style={{ margin: 0 }}>Restablecer las reglas</h2>
            <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Devuelve <b>todas las perillas de esta pantalla</b> a los valores por defecto de CURVA. {modificado ? <span style={{ color: "var(--warn)", fontWeight: 600 }}>Ahora mismo tienes valores cambiados.</span> : "Ahora mismo todo está en los valores por defecto."}
              <br />No toca tus <b>proyectos</b>, <b>pagos</b> ni <b>personas del equipo</b> — solo las reglas del modelo.
            </p>
          </div>
          {!confirmReset ? (
            <button className="btn" disabled={!modificado} onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Restablecer</button>
          ) : (
            <div className="reset-confirm">
              <span className="reset-q"><AlertTriangle size={15} /> ¿Seguro?</span>
              <button className="btn danger" onClick={doReset}>Sí, restablecer</button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancelar</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- helpers UI ---------------- */
function Tile({ k, l, v, p, tip }: { k: string; l: string; v: string; p?: string; tip?: string }) {
  return <div className={"tile " + k}><div className="tl"><i />{l}{tip && <span className="tip" data-tip={tip} style={{ marginLeft: "auto" }}><Info /></span>}</div><div className="tv">{v}</div>{p && <div className="tp">{p}</div>}</div>;
}
function Rank({ rows }: { rows: { nombre: string; quien: Quien; trabajo: number; extra: number; comision?: number }[] }) {
  const totOf = (a: { trabajo: number; extra: number; comision?: number }) => a.trabajo + a.extra + (a.comision || 0);
  const max = Math.max(1, ...rows.map(totOf));
  if (!rows.length) return <div className="hint">Sin datos.</div>;
  return <div className="rank">{rows.map((a, i) => { const base = a.trabajo + a.extra; const comis = a.comision || 0; const tot = base + comis; return (
    <div key={i} className="rk"><div className="who">{comis > 0.5 && <span className="comis-dot" title={`Incluye ${fmtMXN(comis)} de comisión por traer el proyecto`} />}<span className="nm">{a.nombre}</span><span className={"badge " + badgeCls[a.quien]}>{badgeTxt[a.quien]}</span></div>
      <div className="track">{base > 0.5 && <i style={{ width: Math.max(3, base / max * 100) + "%", background: `var(${roleColor[a.quien]})` }} />}{comis > 0.5 && <i className="seg-comis" title={`Comisión: ${fmtMXN(comis)}`} style={{ width: Math.max(3, comis / max * 100) + "%", background: "var(--c-caja)" }} />}</div>
      <div className="amt">{fmtMXN(tot)}{comis > 0.5 && <span className="amt-comis">{fmtMXN(base)} + {fmtMXN(comis)}</span>}</div></div>); })}</div>;
}
function Field({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 3 }}>{l}</div><div style={{ fontWeight: strong ? 700 : 500, fontFamily: strong ? "var(--mono)" : "var(--sans)", color: strong ? "var(--pos)" : "var(--ink)" }}>{v}</div></div>;
}
