"use client";
import { useEffect, useState, useCallback, useRef, Component, type ReactNode, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  LayoutDashboard, Calculator, FolderKanban, Receipt, SlidersHorizontal, UploadCloud, Check,
  FileText, Plus, ChevronDown, ChevronRight, ArrowRight, Wallet, Info, RotateCcw, AlertTriangle, Trash2,
  Scale, CalendarRange, Users, Share2, Copy,
} from "lucide-react";
import {
  compute, fmtMXN, pctFmt, metaBanca, totalCliente, pctRecibido, desembolso, desembolsoDePago, agrupaCajas,
  cajaLabel, CAJA_ORDER, isSocio,
  repartoPorMes, ticketSinIVA, baseBolsaDesglose, reglasDifierenDinero, isrReservaDe,
  todayISO, addMonths, mesLabel, mesDe, membersResolved, reglasDe,
  REGLAS_DEFAULT, IVA, ROLNAME, type Proyecto, type Reglas, type Miembro, type Quien, type Pago, type ReparteMes,
  type EstadoProyecto, type Rol, type CajaKind, type CajaGrupo, type DatosBancarios,
} from "@/lib/reparto";

type Gasto = { n: string; m: number; proyectoId?: string | null; proveedor?: string; fecha?: string | null; esIngreso?: boolean; id?: string; categoria?: string };
type Cliente = { id: string; nombre: string; estado: string | null };
// Directorio del equipo: defines a cada persona UNA vez (nombre + qué es) y la
// reutilizas en cualquier proyecto. Los socios A/B no viven aquí: son fijos y su
// nombre sale de Reglas (nombreA/nombreB), así nunca se desincroniza.
type RosterPerson = { id: string; nombre: string; quien: Quien };
// Evento de la bitácora (historial compartido): quién hizo qué y cuándo. Se sincroniza.
type LogEvent = { id: string; ts: number; who: "A" | "B" | null; act: string; det: string };
type State = { params: Reglas; gastos: Gasto[]; projects: Proyecto[]; roster: RosterPerson[]; activeId: string; rulesVersion?: number; saldosIniciales?: Record<CajaKind, number>; banco?: DatosBancarios; bitacora?: LogEvent[] };
const RULES_VERSION = 9; // sube esto cuando una decisión deba re-aplicarse a estados guardados
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

// Firmas de los DOS socios para los comprobantes de pago. Se guardan SOLO en este
// equipo (localStorage aparte del estado sincronizado) — la Supabase de la app es
// compartida y PROD, así que las firmas nunca suben al server (HARD RULE).
// Cada socio firma en su propio equipo (o los dos aquí, si comparten la compu).
type FirmaSlot = "A" | "B";
const FIRMA_KEYS: Record<FirmaSlot, string> = { A: "curva_socios_firma_A", B: "curva_socios_firma_B" };
const loadFirma = (slot: FirmaSlot): string => {
  try {
    // Migración: la firma única de antes pasa a ser la de Andrés (slot A).
    if (slot === "A") {
      const old = localStorage.getItem("curva_socios_firma");
      if (old && !localStorage.getItem(FIRMA_KEYS.A)) { localStorage.setItem(FIRMA_KEYS.A, old); localStorage.removeItem("curva_socios_firma"); }
    }
    return localStorage.getItem(FIRMA_KEYS[slot]) || "";
  } catch { return ""; }
};
const saveFirma = (slot: FirmaSlot, d: string) => { try { d ? localStorage.setItem(FIRMA_KEYS[slot], d) : localStorage.removeItem(FIRMA_KEYS[slot]); } catch { /* noop */ } };
// Reescala la firma a máx 600px de ancho y la re-emite como PNG (conserva el
// fondo transparente si lo trae). Mantiene chico el dataURI en localStorage.
const compressFirma = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("sin canvas"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("imagen inválida"));
    img.src = reader.result as string;
  };
  reader.onerror = () => reject(new Error("no se pudo leer"));
  reader.readAsDataURL(file);
});
const DEF_ROSTER: RosterPerson[] = [
  { id: "r_ivana", nombre: "Ivana", quien: "nucleo" },
  { id: "r_lomba", nombre: "Lomba", quien: "nucleo" },
  { id: "r_yannick", nombre: "Yannick", quien: "nucleo" },
  { id: "r_diana", nombre: "Diana", quien: "nucleo" },
];

const KEY = "curva_socios_v1";
const uid = () => "p" + Math.random().toString(36).slice(2, 9);
// Color por caja de destino en las tarjetas de desembolso.
// Color de cada caja de Revolut (dot en las tarjetas de cajas / tesorería).
const cajaKindColor: Record<CajaKind, string> = {
  masaSalarial: "--c-equipo", socioA: "--c-andres", socioB: "--c-balmo",
  cajaProyecto: "--c-caja", cajaAhorro: "--c-banca", banca: "--c-reserva",
};
const ESTADO_LABEL: Record<EstadoProyecto, string> = {
  cotizacion: "Cotización", activo: "Activo", cerrado: "Cerrado", cancelado: "Cancelado",
};
// El estado se DERIVA solo de lo cobrado (no se elige a mano): sin pagos = Cotización,
// con pagos = Activo, 100% cobrado = Cerrado. "Cancelado" es lo único manual (se guarda
// en pr.estado). Así el usuario no tiene que mantener el estado a mano.
function estadoAuto(pr: Proyecto): EstadoProyecto {
  if ((pr.estado ?? "cotizacion") === "cancelado") return "cancelado";
  const rec = pctRecibido(pr);
  return rec >= 0.999 ? "cerrado" : rec > 0.0001 ? "activo" : "cotizacion";
}
const roleColor: Record<Quien, string> = { socioA: "--c-andres", socioB: "--c-balmo", nucleo: "--c-banca", nuevo: "--muted" };
const badgeCls: Record<Quien, string> = { socioA: "b-socio", socioB: "b-socio", nucleo: "b-nucleo", nuevo: "b-nuevo" };
const badgeTxt: Record<Quien, string> = { socioA: "socio", socioB: "socio", nucleo: "núcleo", nuevo: "nuevo" };
const order: Record<Quien, number> = { socioA: 0, socioB: 1, nucleo: 2, nuevo: 3 };
// Default de % de caja del proyecto por tipo — ahora sale de Reglas (editable), no
// hardcodeado. Cada proyecto puede sobreescribirlo con su slider en la Calculadora.
const cajaPresetDe = (R: Reglas) => ({ trazo: R.cajaTrazo, trayectoria: R.cajaTrayectoria, alianza: R.cajaAlianza } as const);
const DEF_GASTOS: Gasto[] = [
  { n: "ChatGPT", m: 360 }, { n: "Claude Max", m: 1800 }, { n: "Claude", m: 360 }, { n: "Notion", m: 400 }, { n: "Contadora", m: 800 },
];

// ── Gastos por proyecto: la "caja del proyecto" (ticket × cajaPct) es un presupuesto
// del que se van restando gastos categorizados. Los gastos con proyectoId salen de esa
// caja (y NO cuentan como overhead de la empresa). Los sin proyectoId = overhead. ──
const CAT_GASTO = ["Viáticos", "Comidas", "Transporte", "Herramientas", "Subcontratación", "Otros"] as const;
const gastosDeProyecto = (gastos: Gasto[], id: string): Gasto[] => gastos.filter((g) => g.proyectoId === id && !g.esIngreso);
const cajaMonto = (pr: Proyecto): number => Math.max(0, +pr.ticket || 0) * ((pr.cajaPct || 0) / 100);
const sumaGastos = (gs: Gasto[]): number => gs.reduce((a, g) => a + (+g.m || 0), 0);

// Compartir por el sheet nativo del sistema (WhatsApp, correo, etc.) usando Web Share
// API en móvil; en desktop o sin soporte cae a wa.me con el texto ya escrito. Así lo
// que hoy exportas a PDF también se puede mandar directo por WhatsApp desde la app.
async function compartir(title: string, text: string) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text });
      return;
    }
  } catch {
    return; // el usuario canceló el sheet
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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
type Snapshot = { projects: Record<string, string>; params: string; gastos: string; roster: string; rulesVersion: number; saldos: string; banco: string; bitacora: string };
function snapshotOf(s: State): Snapshot {
  const projects: Record<string, string> = {};
  s.projects.filter((p) => !p.borrador).forEach((p) => { projects[p.id] = JSON.stringify(p); });
  return { projects, params: JSON.stringify(s.params), gastos: JSON.stringify(s.gastos), roster: JSON.stringify(s.roster || []), rulesVersion: s.rulesVersion || RULES_VERSION, saldos: JSON.stringify(mergeSaldos(s.saldosIniciales)), banco: JSON.stringify(mergeBanco(s.banco)), bitacora: JSON.stringify(s.bitacora || []) };
}
function hayPendientes(s: State, snap: Snapshot): boolean {
  const cur = snapshotOf(s);
  if (cur.params !== snap.params || cur.gastos !== snap.gastos || cur.roster !== snap.roster || cur.rulesVersion !== snap.rulesVersion || cur.saldos !== snap.saldos || cur.banco !== snap.banco || cur.bitacora !== snap.bitacora) return true;
  const ids = new Set([...Object.keys(cur.projects), ...Object.keys(snap.projects)]);
  for (const id of ids) if (cur.projects[id] !== snap.projects[id]) return true;
  return false;
}

function newProject(name: string): Proyecto {
  return {
    id: uid(), nombre: name, ticket: 80000, tipo: "trazo", cajaPct: 10, comisOn: true, comisWho: "banca", origen: "empresa", inMonth: true,
    members: [{ rol: "P", quien: "socioA", nombre: "Andrés", sm: 1, personId: "socioA" }, { rol: "E", quien: "nucleo", nombre: "Ivana", sm: 1, personId: "r_ivana" }],
    plazoMeses: 1, modoCobro: "golpe", conIVA: false, descontarISR: true, estado: "cotizacion", fechaInicio: todayISO(), pagos: [],
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
  { k: "cotizador", label: "Cotizador", Icon: FileText },
  { k: "proyectos", label: "Proyectos", Icon: FolderKanban },
  { k: "mimes", label: "Mi mes", Icon: Scale },
  { k: "personas", label: "Personas", Icon: Users },
  { k: "cajas", label: "Cajas", Icon: Wallet },
  { k: "facturas", label: "Facturas", Icon: Receipt },
  { k: "reglas", label: "Reglas", Icon: SlidersHorizontal },
] as const;

// Red de seguridad: si una vista lanza una excepción en render (p. ej. un dato viejo
// con forma rara), en vez de tumbar TODA la app (pantalla en blanco) mostramos un aviso
// y dejamos recargar. Se resetea al cambiar de sección (key={sec} donde se usa).
class ErrorBoundary extends Component<{ children: ReactNode }, { err: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) return (
      <div className="card" style={{ margin: 20 }}>
        <h2>Se evitó una caída en esta vista</h2>
        <p className="hint" style={{ marginBottom: 14 }}>Algo se rompió aquí (normalmente un dato viejo con forma rara), pero protegimos el resto de la app. Recarga; si vuelve a pasar en un proyecto, ábrelo y revisa su plazo/datos.</p>
        <button className="btn primary" onClick={() => { try { location.reload(); } catch { /* noop */ } }}>Recargar</button>
      </div>
    );
    return this.props.children;
  }
}

/* Puerta de identidad: "¿Quién eres?" — elige socio al entrar (device-local, sin
   permisos). Personaliza Mi mes, firma de PDF, saludo y a quién le toca autorizar. */
function IdentityGate({ nombreA, nombreB, onPick }: { nombreA: string; nombreB: string; onPick: (v: "A" | "B") => void }) {
  return (
    <div className="id-gate">
      <div className="id-card">
        <div className="id-logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M2 19 C7 19 8 15 12 10 C15 6 18 4 22 4" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" /><circle cx={22} cy={4} r={2} fill="currentColor" /></svg>
          <b>CURVA <span>Socios</span></b>
        </div>
        <h1>¿Quién eres?</h1>
        <p>Entra como socio para ver lo tuyo — tu mes, tu firma y qué te toca revisar.</p>
        <div className="id-pick">
          <button type="button" className="id-btn a" onClick={() => onPick("A")}><span className="id-av">{(nombreA || "A").charAt(0)}</span><b>{nombreA}</b><em>Soy yo</em></button>
          <button type="button" className="id-btn b" onClick={() => onPick("B")}><span className="id-av">{(nombreB || "B").charAt(0)}</span><b>{nombreB}</b><em>Soy yo</em></button>
        </div>
        <p className="id-foot">Solo se guarda en este equipo. Puedes cambiarlo cuando quieras.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [sec, setSec] = useState<string>("panel");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // Identidad del socio en ESTE equipo (device-local). "A"=Andrés, "B"=Balmo. Sin
  // permisos (todo en conjunto): solo personaliza "Mi mes", el saludo, la firma de PDF
  // y a quién le toca autorizar. Decisión Andrés 2026-07-22.
  const [yo, setYo] = useState<"A" | "B" | null>(null);
  useEffect(() => { try { const v = localStorage.getItem("curva_yo"); if (v === "A" || v === "B") setYo(v); } catch { /* noop */ } }, []);
  const elegirYo = (v: "A" | "B" | null) => { setYo(v); try { if (v) localStorage.setItem("curva_yo", v); else localStorage.removeItem("curva_yo"); } catch { /* noop */ } };
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
      if ((s.rulesVersion || 0) < 8) { merged.params.imp = 1.5; }               // ISR opcional por proyecto → tasa 1.5% (editable)
      if ((s.rulesVersion || 0) < 9) { merged.params.pool = 10; }               // Bono del Núcleo encendido al 10% (decisión Andrés 2026-07-23)
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
          if (rv < 8) params.imp = 1.5;   // ISR opcional por proyecto → tasa 1.5% (editable)
          if (rv < 9) params.pool = 10;   // Bono del Núcleo encendido al 10%
          let projects: Proyecto[] = (srv.projects || []);
          if (rv < 4) projects = projects.map(migrateProject);
          if (rv < 7) projects = freezeLegacyReglas(projects);   // congela guardados del server (verdad PROD)
          setSt((prev) => {
            const gastos = srv.gastos || prev?.gastos || DEF_GASTOS.slice();
            const roster = (srv.roster && srv.roster.length ? srv.roster : (prev?.roster || DEF_ROSTER.slice()));
            const drafts = (prev?.projects || []).filter((p) => p.borrador);   // el borrador es local, no viene del server
            const all = [...projects, ...drafts];
            const activeId = prev && all.some((p) => p.id === prev.activeId) ? prev.activeId : (all[0]?.id || "");
            const next: State = { params, gastos, projects: all, roster, activeId, rulesVersion: RULES_VERSION, saldosIniciales: mergeSaldos(srv.saldosIniciales ?? prev?.saldosIniciales), banco: mergeBanco(srv.banco ?? prev?.banco), bitacora: (srv.bitacora as LogEvent[]) ?? prev?.bitacora ?? [] };
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
      if (snap.bitacora !== cur.bitacora) body.bitacora = st.bitacora || [];
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
            const next: State = { params, gastos, projects: all, roster, activeId, rulesVersion: RULES_VERSION, saldosIniciales: mergeSaldos(srv.saldosIniciales ?? curr?.saldosIniciales), banco: mergeBanco(srv.banco ?? curr?.banco), bitacora: (srv.bitacora as LogEvent[]) ?? curr?.bitacora ?? [] };
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
  // Overhead de la empresa = solo gastos SIN proyecto. Los de proyecto salen de la caja
  // de su proyecto (no del overhead global), para no contarlos dos veces.
  const overhead = st.gastos.filter((g) => !g.proyectoId).reduce((s, g) => s + (+g.m || 0), 0);
  const update = (fn: (s: State) => State) => setSt((prev) => (prev ? fn(structuredClone(prev)) : prev));
  const updateActive = (fn: (p: Proyecto) => void) => update((s) => { const p = s.projects.find((x) => x.id === s.activeId); if (p) fn(p); return s; });
  // Bitácora compartida: registra quién (yo) hizo qué. Se guarda al frente, cap 120.
  const log = (act: string, det: string) => update((s) => { s.bitacora = [{ id: uid(), ts: Date.now(), who: yo, act, det }, ...(s.bitacora || [])].slice(0, 120); return s; });

  if (!yo) return <IdentityGate nombreA={st.params.nombreA} nombreB={st.params.nombreB} onPick={elegirYo} />;
  const yoNombre = yo === "A" ? st.params.nombreA : st.params.nombreB;
  const otroNombre = yo === "A" ? st.params.nombreB : st.params.nombreA;

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M2 19 C7 19 8 15 12 10 C15 6 18 4 22 4" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" /><circle cx={22} cy={4} r={2} fill="currentColor" /></svg>
          <b>CURVA <span>Socios</span></b>
        </div>
        <nav className="nav">
          {NAV.map(({ k, label, Icon }) => (
            <button key={k} type="button" className={sec === k ? "on" : ""} aria-current={sec === k ? "page" : undefined} onClick={() => setSec(k)}><Icon /> {label}</button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="yo-tag"><span className={"yo-dot " + (yo === "A" ? "a" : "b")} />Soy <b>{yoNombre}</b> · <button type="button" className="theme-toggle" onClick={() => elegirYo(null)}>cambiar</button></div>
          <button type="button" className="theme-toggle" onClick={() => {
            const cur = document.documentElement.getAttribute("data-theme");
            const next = cur === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            try { localStorage.setItem("curva_theme", next); } catch { /* noop */ }
          }}>Cambiar tema</button>
        </div>
      </aside>

      <main className="main">
        <ErrorBoundary key={sec}>
          {sec === "panel" && <Panel st={st} overhead={overhead} update={update} yoNombre={yoNombre} setSec={setSec} />}
          {sec === "calculadora" && <Calculadora st={st} active={active} clientes={clientes} update={update} updateActive={updateActive} setSec={setSec} setToast={setToast} log={log} />}
          {sec === "cotizador" && <Cotizador st={st} active={active} clientes={clientes} update={update} updateActive={updateActive} setSec={setSec} setToast={setToast} log={log} />}
          {sec === "proyectos" && <Proyectos st={st} update={update} otroNombre={otroNombre} log={log} setActive={(id) => { update((s) => { s.activeId = id; return s; }); setSec("calculadora"); }} />}
          {sec === "mimes" && <MiMes st={st} setSec={setSec} yoNombre={yoNombre} />}
          {sec === "personas" && <Personas st={st} />}
          {sec === "cajas" && <Cajas st={st} update={update} setSec={setSec} log={log} />}
          {sec === "facturas" && <Facturas st={st} clientes={clientes} update={update} />}
          {sec === "reglas" && <ReglasView st={st} update={update} />}
        </ErrorBoundary>
      </main>
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

/* ---------------- Panel ---------------- */
// "hace X" para la bitácora. Date.now() es válido en el navegador (no en workflows).
function agoStr(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
function Panel({ st, overhead, update, yoNombre, setSec }: { st: State; overhead: number; update: (fn: (s: State) => State) => void; yoNombre?: string; setSec?: (s: string) => void }) {
  const meta = metaBanca(st.params);
  const vivos = st.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);

  // ── Agregación por MES-CALENDARIO (PROYECTADO / Método A) sobre proyectos vivos ──
  // Una sola pasada alimenta: tiles del mes, ranking del mes, flujo y Cortes. Todo
  // "por mes" (devengado), sin mezclar bases de tiempo como antes.
  type PplRow = { nombre: string; quien: Quien; trabajo: number; extra: number; comision: number };
  type MesAgg = { equipo: number; socios: number; utilSocios: number; baseISR: number; banca: number; caja: number; gastos: number; ppl: Record<string, PplRow>; proys: Set<string> };
  const nuevoMes = (): MesAgg => ({ equipo: 0, socios: 0, utilSocios: 0, baseISR: 0, banca: 0, caja: 0, gastos: 0, ppl: {}, proys: new Set() });
  const porMes: Record<string, MesAgg> = {};
  vivos.forEach((p) => {
    const R = reglasDe(p, st.params);
    const rm = repartoPorMes(membersResolved(p, st.roster, R), R);
    const inicio = p.fechaInicio || todayISO();
    const plazoNp = Math.max(1, Math.floor(p.plazoMeses || 1));
    rm.forEach((mm) => {
      const ym = addMonths(inicio, mm.mes - 1);
      const Mm = (porMes[ym] = porMes[ym] || nuevoMes());
      // mm.banca YA incluye la caja de ahorro; la caja es solo la del proyecto.
      Mm.banca += mm.banca; Mm.caja += mm.cajaProyecto; Mm.proys.add(p.id);
      // ISR = % sobre la FACTURACIÓN (base): acumula la porción del ticket de este mes.
      if (p.descontarISR) Mm.baseISR += (Math.max(0, +p.ticket || 0)) / plazoNp;
      Object.values(mm.personas).forEach((pe) => {
        const v = pe.trabajo + pe.extra + pe.comision;
        if (isSocio(pe.quien)) { Mm.socios += v; Mm.utilSocios += pe.extra; } else Mm.equipo += v;
        const k = pe.nombre + "|" + pe.quien;
        const a = (Mm.ppl[k] = Mm.ppl[k] || { nombre: pe.nombre, quien: pe.quien, trabajo: 0, extra: 0, comision: 0 });
        a.trabajo += pe.trabajo; a.extra += pe.extra; a.comision += pe.comision;
      });
    });
  });
  // Gastos por mes: gastos de proyecto en su fecha + overhead fijo en cada mes activo.
  st.gastos.filter((g) => g.proyectoId && !g.esIngreso).forEach((g) => { const ym = mesDe(g.fecha); if (ym && porMes[ym]) porMes[ym].gastos += +g.m || 0; });
  Object.values(porMes).forEach((Mm) => { Mm.gastos += overhead; });

  const allYM = Object.keys(porMes).sort();
  const curYM = todayISO().slice(0, 7);
  const [ymSel, setYmSel] = useState<string>("");
  const selYM = allYM.includes(ymSel) ? ymSel : allYM.includes(curYM) ? curYM : (allYM[0] || curYM);
  const M = porMes[selYM] || nuevoMes();
  const ingresoMes = M.equipo + M.socios + M.banca + M.caja;
  // ISR = % sobre la facturación de los proyectos con "Descontar ISR" (base × tasa),
  // apartado del neto de socios. Antes se calculaba mal sobre la utilidad de socios.
  const isrReservaMes = M.baseISR * st.params.imp / 100;
  const netoMes = Math.max(0, M.utilSocios - overhead - isrReservaMes);
  const rows = Object.values(M.ppl).filter((a) => a.trabajo + a.extra + a.comision > 0.5).sort((a, b) => (b.trabajo + b.extra + b.comision) - (a.trabajo + a.extra + a.comision) || order[a.quien] - order[b.quien]);
  const proysDelMes = vivos.filter((p) => M.proys.has(p.id));

  const alerts: [string, string][] = [];
  if (M.banca < meta * 0.34) alerts.push(["warn", `La Banca de ${mesLabel(selYM)} (${fmtMXN(M.banca)}) va corta para la meta mensual del colchón (${fmtMXN(meta)}).`]);
  else if (M.banca < meta) alerts.push(["info", `La Banca de ${mesLabel(selYM)} va en ${Math.round(M.banca / (meta || 1) * 100)}% de la meta mensual (${fmtMXN(meta)}). Vas bien.`]);
  else alerts.push(["ok", `La Banca de ${mesLabel(selYM)} ya cubre la meta del colchón. Sano.`]);
  proysDelMes.forEach((p) => { const r = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params)); const mr = r.marginOp / (r.t || 1); if (mr < 0.25) alerts.push(["warn", `${p.nombre}: margen bajo (${pctFmt(mr)}). Sube precio o baja gente.`]); });

  // ── Proyección acumulada (todos los proyectos vivos, a valor completo) ──
  let sAndres = 0, sBalmo = 0, sEquipo = 0, sBancaAll = 0, sCobrado = 0, sTicket = 0, proysPorCobrar = 0;
  vivos.forEach((p) => {
    const rr = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params));
    sTicket += rr.t;
    const cobP = (p.pagos || []).reduce((a, x) => a + (+x.monto || 0), 0);
    sCobrado += cobP;
    if (cobP > 0.5 && cobP < rr.t - 0.5) proysPorCobrar++;
    sBancaAll += rr.banca;
    Object.values(rr.people).forEach((a) => {
      const v = a.trabajo + a.extra + (a.comision || 0);
      if (a.quien === "socioA") sAndres += v; else if (a.quien === "socioB") sBalmo += v; else sEquipo += v;
    });
  });
  const porCobrar = Math.max(0, sTicket - sCobrado);
  // Facturación REAL cobrada en el mes seleccionado vs la meta de ventas del mes.
  const cobradoMes = st.projects.filter((p) => !p.borrador).reduce((s, p) => s + (p.pagos || []).filter((x) => mesDe(x.fecha) === selYM).reduce((a, x) => a + (+x.monto || 0), 0), 0);
  const metaFact = +st.params.metaFacturacion || 0;
  const factPct = metaFact > 0 ? cobradoMes / metaFact : 0;
  // Pendientes por atender (para el centro de mando).
  const porAutorizar = vivos.filter((p) => p.members.some((m) => typeof m.montoManual === "number") && !p.manualOK).length;
  const bancaCorta = M.banca < meta;

  // Flujo por mes (= ingreso del mes) y Cortes: derivados de porMes (todo devengado).
  const flujoVal = (x: MesAgg) => x.equipo + x.socios + x.banca + x.caja;
  const mesesFlujo = allYM.slice(0, 9);
  const maxFlujo = Math.max(1, ...mesesFlujo.map((m) => flujoVal(porMes[m])));
  const mesesCorte = allYM.slice(0, 12);
  const corteCols: [string, (x: MesAgg) => number][] = [
    ["Total", flujoVal], ["Equipo", (x) => x.equipo], ["Socios", (x) => x.socios],
    ["Banca", (x) => x.banca], ["Caja proy.", (x) => x.caja], ["Gastos", (x) => x.gastos],
  ];

  return (
    <>
      <div className="page-h"><div><h1>{yoNombre ? `Hola, ${yoNombre}` : "Panel"}</h1><p>El estado de CURVA, mes a mes. Elige el mes para ver sus números (proyectado según el plazo de cada proyecto).</p></div></div>
      {allYM.length > 0 && (
        <div className="proj-bar" style={{ flexWrap: "wrap" }}>
          <div className="pb-group"><span className="pb-cap"><CalendarRange size={13} style={{ verticalAlign: -2 }} /> Mes</span>
            <div className="chips scroll">
              {allYM.map((m) => <button key={m} className="chip-btn" aria-pressed={m === selYM} onClick={() => setYmSel(m)}>{mesLabel(m)}</button>)}
            </div>
          </div>
        </div>
      )}

      <div className="two rise" style={{ marginBottom: 18, alignItems: "stretch" }}>
        <div className="meta-hero">
          <div className="meta-hero-top"><span className="meta-cap">Meta de facturación · {mesLabel(selYM)}</span><span className="meta-pct">{pctFmt(Math.min(1, factPct))}</span></div>
          <div className="meta-nums"><b>{fmtMXN(cobradoMes)}</b><span>cobrado de {fmtMXN(metaFact)}</span></div>
          <div className="meta-bar"><i style={{ width: Math.min(100, factPct * 100) + "%" }} /></div>
          <div className="meta-foot">{cobradoMes >= metaFact ? "¡Meta del mes cumplida!" : `Faltan ${fmtMXN(Math.max(0, metaFact - cobradoMes))} para el sueño del mes.`}</div>
        </div>
        <div className="atn-card">
          <div className="atn-head">Qué necesita tu atención</div>
          {(porAutorizar + proysPorCobrar + (bancaCorta ? 1 : 0)) === 0 ? (
            <div className="atn-empty"><Check size={16} /> Todo al día. Nada pendiente.</div>
          ) : (
            <div className="atn-list">
              {porAutorizar > 0 && <button className="atn-row" onClick={() => setSec?.("proyectos")}><span className="atn-ic warn"><AlertTriangle size={15} /></span><span className="atn-t"><b>{porAutorizar}</b> proyecto{porAutorizar !== 1 ? "s" : ""} por autorizar (sueldos a mano)</span><ChevronRight size={15} /></button>}
              {proysPorCobrar > 0 && <button className="atn-row" onClick={() => setSec?.("proyectos")}><span className="atn-ic cob"><Wallet size={15} /></span><span className="atn-t"><b>{proysPorCobrar}</b> proyecto{proysPorCobrar !== 1 ? "s" : ""} por cobrar · falta {fmtMXN(porCobrar)}</span><ChevronRight size={15} /></button>}
              {bancaCorta && <button className="atn-row" onClick={() => setSec?.("cajas")}><span className="atn-ic warn"><AlertTriangle size={15} /></span><span className="atn-t">La Banca de {mesLabel(selYM)} va corta para la meta del colchón</span><ChevronRight size={15} /></button>}
            </div>
          )}
        </div>
      </div>

      <div className="tiles rise">
        <Tile k="k-fact" l={`Ingreso de ${mesLabel(selYM)}`} v={fmtMXN(ingresoMes)} p={`${proysDelMes.length} proyecto${proysDelMes.length !== 1 ? "s" : ""} · proyectado`} tip="Lo que los proyectos activos reparten en el mes elegido (equipo + socios + Banca + caja), según su plazo. Es proyectado (devengado), no lo cobrado." />
        <Tile k="k-a" l="Utilidad socios del mes" v={fmtMXN(M.utilSocios)} p="antes de gastos" tip="La utilidad de dueños de Andrés y Balmo en el mes elegido, ANTES de gastos e impuestos (no cuenta lo que cobran por trabajar el proyecto)." />
        <Tile k="k-banca" l="A la Banca del mes" v={fmtMXN(M.banca)} p="colchón" tip="Lo que va al colchón de CURVA en el mes elegido (caja de ahorro + sombrero de socio)." />
        <Tile k="k-neto" l="Neto socios del mes" v={fmtMXN(netoMes)} p="después de gastos e imp." tip="Utilidad de socios del mes − gastos fijos (overhead) − ISR (tasa sobre la facturación de los proyectos con “Descontar ISR” activo)." />
      </div>
      <div className="two rise r2">
        <div className="card">
          <h2>Banca — colchón de CURVA</h2>
          <div className="prog"><i style={{ width: Math.min(100, M.banca / (meta || 1) * 100) + "%" }} /></div>
          <div className="prog-lbl"><span>{mesLabel(selYM)}: <b>{fmtMXN(M.banca)}</b></span><span>Meta mensual: <b>{fmtMXN(meta)}</b></span></div>
          <p className="foot">La Banca la alimentan el sombrero de socio y la caja de ahorro. Colchón de emergencia de CURVA y trampolín para pasar a alguien a nómina. Meta por mes: <b>{fmtMXN(meta)}</b>.</p>
        </div>
        <div className="card"><h2>Alertas</h2>{alerts.map((a, i) => <div key={i} className={"alert " + a[0]}>{a[1]}</div>)}</div>
      </div>
      <div className="two">
        <div className="card"><h2>Proyectos de {mesLabel(selYM)}</h2>{proysDelMes.length ? proysDelMes.map((p) => { const r = compute(membersResolved(p, st.roster, reglasDe(p, st.params)), reglasDe(p, st.params)); return (<div key={p.id} className="grow"><div><div className="gn">{p.nombre}</div><div className="gt">{p.tipo} · {p.members.length} pers.</div></div><div className="gv">{fmtMXN(r.t)}</div><div className="gm">margen {pctFmt(r.marginOp / (r.t || 1))}</div></div>); }) : <div className="hint">Ningún proyecto en este mes.</div>}</div>
        <div className="card"><h2>Cuánto cobra cada quien en {mesLabel(selYM)}</h2><Rank rows={rows} /></div>
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
        <h3>Flujo de ingresos por mes</h3>
        {mesesFlujo.length ? (
          <div className="flow">
            {mesesFlujo.map((m) => (
              <div className="flow-col" key={m}>
                <div className="flow-v">{fmtMXN(flujoVal(porMes[m]))}</div>
                <div className="flow-bar" style={{ height: Math.max(6, flujoVal(porMes[m]) / maxFlujo * 96) + "px" }}><div className="flow-seg" style={{ height: "100%", background: "var(--grad)" }} /></div>
                <div className="flow-x">{mesLabel(m)}</div>
              </div>
            ))}
          </div>
        ) : <div className="hint">Agrega proyectos con fecha de inicio para ver el flujo.</div>}
        <p className="foot">Cada proyecto se reparte en el tiempo según su plazo (Método A). Ingresos proyectados, sin IVA.</p>
      </div>

      {mesesCorte.length > 0 && (
        <div className="card">
          <h2>Cortes mensuales — a dónde va cada peso</h2>
          <p className="hint" style={{ marginTop: 0 }}>Mes a mes (según el plazo de cada proyecto): cuánto se reparte a cada bolsa y los gastos del mes (incluye el overhead fijo).</p>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `minmax(72px,0.9fr) repeat(${corteCols.length}, minmax(78px,1fr))`, gap: "5px 12px", minWidth: 580, fontSize: 13, alignItems: "center" }}>
              <div style={{ fontWeight: 700, opacity: 0.55, fontSize: 12, textTransform: "uppercase" }}>Mes</div>
              {corteCols.map(([label]) => <div key={"h-" + label} style={{ fontWeight: 700, opacity: 0.55, fontSize: 12, textTransform: "uppercase", textAlign: "right" }}>{label}</div>)}
              {mesesCorte.flatMap((ym) => [
                <div key={ym + "-m"} style={{ fontWeight: 700, borderTop: "1px solid var(--border)", paddingTop: 4 }}>{mesLabel(ym)}</div>,
                ...corteCols.map(([label, fn]) => (
                  <div key={ym + "-" + label} style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: label === "Total" ? 700 : 400, color: label === "Total" ? "var(--cobalt)" : label === "Gastos" ? "var(--c-caja)" : undefined, borderTop: "1px solid var(--border)", paddingTop: 4 }}>{fmtMXN(fn(porMes[ym]))}</div>
                )),
              ])}
            </div>
          </div>
          <p className="foot">“Total” = lo que se reparte ese mes (equipo + socios + Banca + cajas). Los gastos salen de la caja de cada proyecto; el overhead es el costo fijo de la empresa cada mes.</p>
        </div>
      )}

      {(st.bitacora || []).length > 0 && (
        <div className="card rise">
          <h2>Últimos movimientos</h2>
          <div className="bita">
            {(st.bitacora || []).slice(0, 8).map((e) => {
              const quien = e.who === "A" ? st.params.nombreA : e.who === "B" ? st.params.nombreB : "Alguien";
              return (
                <div key={e.id} className="bita-row">
                  <span className={"bita-dot " + (e.who === "A" ? "a" : e.who === "B" ? "b" : "")} />
                  <span className="bita-t"><b>{quien}</b> {e.act}{e.det ? <> · <span className="bita-det">{e.det}</span></> : null}</span>
                  <span className="bita-ago">{agoStr(e.ts)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => window.open("/pdf/banco", "_blank")}><FileText size={15} /> Descargar ficha</button>
            <button className="btn ghost" onClick={() => compartir("Datos de cobro CURVA", `*Datos de cobro — CURVA*\nBanco: ${b.banco}\nTitular: ${b.titular}\nCLABE: ${b.clabe}${b.cuenta ? `\nCuenta: ${b.cuenta}` : ""}${b.swift ? `\nSWIFT/BIC: ${b.swift}` : ""}`)}><Share2 size={15} /> WhatsApp</button>
          </div>
        </div>
      ) : (
        <div className="bank-edit">
          {campos.map(([k, l]) => (
            <div className="field" key={k} style={{ margin: 0 }}><label>{l}</label>
              <input type="text" value={b[k]} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
          <FirmaEditor nombreA={st.params?.nombreA || "Andrés"} nombreB={st.params?.nombreB || "Balmo"} />
        </div>
      )}
    </div>
  );
}

/* Pad para DIBUJAR la firma con el dedo o el mouse. Exporta un PNG transparente
   con trazo oscuro fijo (#12213f) — así se ve bien sobre el comprobante en blanco
   sin importar si la app está en claro u oscuro. */
function FirmaPad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: ReactPointerEvent) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    drawing.current = true; last.current = pos(e);
  };
  const move = (e: ReactPointerEvent) => {
    if (!drawing.current) return;
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#12213f";
    const p = pos(e); const l = last.current!;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    if (dirty.current && ref.current) onSave(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
  };
  return (
    <div>
      <canvas ref={ref} width={600} height={170} className="firma-pad"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} />
      <div className="firma-pad-actions">
        <span className="hint" style={{ margin: 0 }}>Dibuja con el dedo o el mouse.</span>
        <button type="button" className="btn ghost" onClick={clear}>Borrar trazo</button>
      </div>
    </div>
  );
}

/* Una ranura de firma por socio. Se guarda device-local (nunca al server). */
function FirmaSlotEditor({ slot, nombre }: { slot: FirmaSlot; nombre: string }) {
  const [firma, setFirma] = useState<string>("");
  const [err, setErr] = useState(false);
  useEffect(() => { setFirma(loadFirma(slot)); }, [slot]);
  const onFile = async (f?: File) => {
    if (!f) return; setErr(false);
    try { const d = await compressFirma(f); saveFirma(slot, d); setFirma(d); }
    catch { setErr(true); }
  };
  return (
    <div className="firma-slot">
      <div className="firma-slot-h">Firma de {nombre || (slot === "A" ? "Socio A" : "Socio B")}</div>
      {firma ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <img src={firma} alt={`Firma de ${nombre}`} className="firma-preview" />
          <button type="button" className="btn ghost" onClick={() => { saveFirma(slot, ""); setFirma(""); }}><Trash2 size={14} /> Rehacer</button>
        </div>
      ) : (
        <>
          <FirmaPad onSave={(d) => { saveFirma(slot, d); setFirma(d); }} />
          <div className="firma-upload">
            <span className="hint" style={{ margin: 0 }}>o sube una imagen:</span>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {err && <p className="hint" style={{ color: "var(--danger)", marginTop: 4 }}>No se pudo leer la imagen. Prueba con un PNG o JPG.</p>}
        </>
      )}
    </div>
  );
}

/* Captura de las firmas de los DOS socios para los comprobantes de pago. */
function FirmaEditor({ nombreA, nombreB }: { nombreA: string; nombreB: string }) {
  return (
    <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
      <label>Firmas para los comprobantes de pago</label>
      <div className="firma-slots">
        <FirmaSlotEditor slot="A" nombre={nombreA} />
        <FirmaSlotEditor slot="B" nombre={nombreB} />
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Cada firma se guarda solo en <b>este equipo</b> (no sube al servidor). Cada socio puede firmar en su propia compu. Al generar un comprobante eliges quién firma.</p>
    </div>
  );
}

/* ---------------- Mi mes (vista de justicia) ----------------
   Suma lo que gana cada persona en TODOS los proyectos activos de un mes dado
   (usando repartoPorMes, Método A) y lo ordena para vigilar que el reparto sea
   justo. El semáforo marca a quien se dispara respecto al promedio del EQUIPO
   (los socios no cuentan para el flag: su utilidad es por diseño, no injusticia). */
type AggMes = { nombre: string; quien: Quien; trabajo: number; extra: number; comision: number; neto: number; proyectos: string[] };
function MiMes({ st, setSec, yoNombre }: { st: State; setSec: (s: string) => void; yoNombre?: string }) {
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
              <div className="chips scroll">
                {allYM.map((m) => <button key={m} className="chip-btn" aria-pressed={m === sel} onClick={() => setYm(m)}>{mesLabel(m)}</button>)}
              </div>
            </div>
          </div>

          <div className="tiles rise">
            <Tile k="k-fact" l="Proyectos activos" v={String(proyectosMes.length)} p={proyectosMes.join(" · ") || "—"} tip="Proyectos que están corriendo en el mes seleccionado." />
            <Tile k="k-equipo" l="Al equipo (Núcleo/nuevos)" v={fmtMXN(totalTeam)} p={`promedio ${fmtMXN(teamAvg)}`} tip="Suma del trabajo del equipo (sin socios) en el mes, cruzando todos los proyectos." />
            <Tile k="k-a" l="A los socios" v={fmtMXN(totalSocios)} p="trabajo + utilidad" tip="Lo que ganan los socios este mes (por su trabajo y su utilidad de dueños)." />
            <Tile k="k-banca" l="Tasa de ISR" v={`${P.imp || 0}%`} p="editable en Reglas" tip="La tasa que se aparta para ISR cuando un proyecto tiene “Descontar ISR” activo. Se prende proyecto por proyecto en la Calculadora; la tasa se edita en Reglas." />
          </div>

          <div className="card">
            <h2>Reparto del mes por persona</h2>
            <p className="hint" style={{ marginTop: 0 }}>Ordenado de mayor a menor. El <b>semáforo</b> avisa si alguien del equipo se dispara respecto al promedio (<span style={{ color: "var(--warn)", fontWeight: 700 }}>●</span> &gt;1.6× · <span style={{ color: "var(--neg)", fontWeight: 700 }}>●</span> &gt;2×). Los socios no se marcan: su utilidad es por diseño.</p>
            {rows.length === 0 ? <div className="hint">Nadie trabaja proyectos este mes.</div> : (
              <div className="rank">
                {rows.map((a, i) => {
                  const tot = totOf(a), fl = flagOf(a);
                  const dot = fl === "bad" ? "var(--neg)" : fl === "warn" ? "var(--warn)" : "var(--pos)";
                  const esYo = !!yoNombre && a.nombre === yoNombre;
                  return (
                    <div key={i} className={"rk" + (esYo ? " yo" : "")}>
                      <div className="who">
                        <span title={fl === "bad" ? "Gana >2× el promedio del equipo" : fl === "warn" ? "Gana >1.6× el promedio" : "En rango"} style={{ width: 8, height: 8, borderRadius: 99, background: dot, display: "inline-block", flex: "0 0 auto" }} />
                        <span className="nm" title={a.proyectos.join(" · ")}>{a.nombre}</span>
                        {esYo && <span className="yo-pill">tú</span>}
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

/* ---------------- Personas (dashboard por persona) ----------------
   El detalle de cada socio y de cada persona del Núcleo: cuánto gana sumando TODOS
   los proyectos vivos, desglosado por proyecto y pronosticado por mes. Reusa
   repartoPorMes (Método A) + fechaInicio para el calendario. */
type AggPersona = { nombre: string; quien: Quien; total: number; neto: number; byProject: Record<string, number>; byMonth: Record<string, number> };
function Personas({ st }: { st: State }) {
  const P = st.params;
  const vivos = st.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);
  const agg: Record<string, AggPersona> = {};
  vivos.forEach((p) => {
    const R = reglasDe(p, P);
    const rm = repartoPorMes(membersResolved(p, st.roster, R), R);
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
  const rows = Object.values(agg).sort((a, b) => b.total - a.total || order[a.quien] - order[b.quien]);
  const [selK, setSelK] = useState<string>("");
  const sel = rows.find((r) => r.nombre + "|" + r.quien === selK) || rows[0];
  const meses = sel ? Object.keys(sel.byMonth).sort() : [];
  const maxMes = Math.max(1, ...meses.map((m) => sel!.byMonth[m]));
  const proyectos = sel ? Object.entries(sel.byProject).sort((a, b) => b[1] - a[1]) : [];
  const maxProj = Math.max(1, ...proyectos.map(([, v]) => v));
  const curYM = todayISO().slice(0, 7);
  const esteMes = sel ? (sel.byMonth[curYM] || 0) : 0;

  return (
    <>
      <div className="page-h">
        <div><h1>Personas</h1><p>El detalle de cada persona: cuánto gana sumando <b>todos</b> los proyectos vivos, por proyecto y pronosticado por mes.</p></div>
        {rows.length > 0 && <button className="btn ghost" title="Genera una hoja por persona con su estabilidad mes a mes (todos los proyectos)" onClick={() => window.open("/pdf/persona", "_blank")}><FileText size={14} /> PDF de todos</button>}
      </div>
      {rows.length === 0 ? (
        <div className="card"><p className="hint" style={{ margin: 0 }}>No hay proyectos vivos con reparto todavía. Arma uno en la Calculadora y guárdalo.</p></div>
      ) : (
        <div className="two">
          <div className="card" style={{ alignSelf: "start" }}>
            <h2 style={{ marginTop: 0 }}>Quién</h2>
            <div style={{ display: "grid", gap: 4 }}>
              {rows.map((r) => {
                const k = r.nombre + "|" + r.quien;
                const on = sel && r.nombre + "|" + r.quien === (sel.nombre + "|" + sel.quien);
                return (
                  <button key={k} onClick={() => setSelK(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", textAlign: "left", cursor: "pointer", padding: "8px 10px", borderRadius: 10, border: "1px solid " + (on ? "var(--cobalt)" : "var(--border)"), background: on ? "var(--glass)" : "transparent" }}>
                    <span><b>{r.nombre}</b> <span className={"badge " + badgeCls[r.quien]}>{badgeTxt[r.quien]}</span></span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{fmtMXN(r.total)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {sel && (
            <div className="stackcol">
              <div className="tiles" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <Tile k="k-fact" l={`Este mes · ${mesLabel(curYM)}`} v={fmtMXN(esteMes)} p="proyectado" tip="Lo que gana esta persona en el mes actual, sumando todos sus proyectos (proyectado, Método A)." />
                <Tile k="k-a" l={`${sel.nombre} · total`} v={fmtMXN(sel.total)} p="todos los proyectos" tip="Todo lo que gana esta persona sumando cada proyecto vivo (bruto, antes de ISR)." />
                <Tile k="k-curva" l="Neto estimado" v={fmtMXN(sel.neto)} p={`después de ISR (${P.imp || 0}%)`} tip="Lo que le queda tras apartar el ISR — solo de los proyectos con “Descontar ISR” activo." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn ghost" title={`Hoja de ${sel.nombre}: estabilidad mes a mes + total`} onClick={() => window.open("/pdf/persona?persona=" + encodeURIComponent(sel.nombre), "_blank")}><FileText size={14} /> PDF de {sel.nombre}</button>
              </div>
              <div className="card">
                <h2>Por proyecto</h2>
                {proyectos.map(([name, v]) => (
                  <div key={name} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}><span>{name}</span><span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{fmtMXN(v)}</span></div>
                    <div className="pcard-prog"><i style={{ width: v / maxProj * 100 + "%" }} /></div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h2>Pronóstico por mes</h2>
                <p className="hint" style={{ marginTop: 0 }}>Cuánto cobra {sel.nombre} cada mes según el plazo de cada proyecto (Método A).</p>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 130, overflowX: "auto", paddingTop: 8 }}>
                  {meses.map((m) => (
                    <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 62 }}>
                      <div style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMXN(sel.byMonth[m])}</div>
                      <div style={{ width: 30, height: Math.max(4, sel.byMonth[m] / maxMes * 84), background: "var(--grad)", borderRadius: 7 }} />
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{mesLabel(m)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ---------------- Equipo por mes (agenda) ----------------
   Deja variar quién trabaja y con qué rol cada mes ("este mes piloteo yo, el que
   viene Lomba"). NO cambia la bolsa total (esa sale del ticket completo, Método A):
   solo redistribuye entre meses/personas. Sin agenda, el equipo base va todos los
   meses por igual. */
function AgendaEditor({ active, st, P, updateActive }: {
  active: Proyecto; st: State; P: Reglas; updateActive: (fn: (p: Proyecto) => void) => void;
}) {
  const N = Math.max(1, Math.floor(+(active.plazoMeses || 0) || 1));
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
                <div className="agenda-mes" key={m} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
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

/* ---------------- Calculadora ---------------- */
function Calculadora({ st, active, clientes, update, updateActive, setSec, setToast, log }: {
  st: State; active: Proyecto; clientes: Cliente[];
  update: (fn: (s: State) => State) => void; updateActive: (fn: (p: Proyecto) => void) => void; setSec: (s: string) => void; setToast: (m: string) => void; log?: (act: string, det: string) => void;
}) {
  const [vistaCobro, setVistaCobro] = useState<"total" | "mes">("mes"); // unidad de TODA la Calculadora: por mes (default) vs total del proyecto
  const [verDesglose, setVerDesglose] = useState(false); // detalle (P&L + "a dónde va") oculto por defecto
  const [reglasDrawer, setReglasDrawer] = useState(false); // panel flotante de Reglas (ajuste en vivo)
  const [simDrawer, setSimDrawer] = useState(false); // simulación: sueldos del mes con todos los proyectos
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  // "+ Nuevo": si ya hay un borrador en curso, CONTINÚALO (no lo perdemos); solo si no
  // hay ninguno se crea uno en blanco. Así editar otro proyecto nunca borra tu trabajo.
  const nuevoBorrador = () => update((s) => {
    const ex = s.projects.find((x) => x.borrador);
    if (ex) { s.activeId = ex.id; return s; }
    const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id;
    return s;
  });
  // Descartar explícitamente el borrador en curso y abrir uno en blanco (con confirmación).
  const descartarBorrador = () => { update((s) => { s.projects = s.projects.filter((x) => !x.borrador); const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id; return s; }); setConfirmDescartar(false); setToast("Borrador descartado"); };
  // Guardar: congela la foto de Reglas del proyecto activo. Si era un BORRADOR, lo
  // "gradúa" y abre uno nuevo en blanco. Si ya era un proyecto guardado (re-guardar),
  // solo re-congela y NO toca tu borrador de trabajo. En ningún caso se pierde el borrador.
  const guardarYNuevo = () => {
    const cur0 = st.projects.find((x) => x.id === st.activeId);
    const eraBorrador = !!cur0?.borrador;
    const nombre = (cur0?.nombre || "El proyecto").trim();
    update((s) => {
      const cur = s.projects.find((x) => x.id === s.activeId);
      if (cur) { cur.borrador = false; cur.reglas = { ...s.params }; }
      if (eraBorrador) { const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id; }
      return s;
    });
    setToast(eraBorrador ? `“${nombre}” guardado` : `“${nombre}” actualizado`);
    log?.(eraBorrador ? "guardó un proyecto" : "actualizó un proyecto", nombre);
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
  // La Calculadora es el banco de trabajo: SIEMPRE calcula con las Reglas VIVAS
  // (st.params), para que mover un umbral/parámetro se refleje al instante. La foto
  // congelada (pr.reglas) solo gobierna cómo se ve el proyecto en Panel/Proyectos/PDF;
  // aquí, al "Actualizar", se recongela con las de ahora. Si el proyecto guardado activo
  // tiene reglas distintas a las vivas, se muestra un aviso (reglasDivergen) abajo.
  const P = st.params, activeRes = membersResolved(active, st.roster, P), r = compute(activeRes, P), t = r.t || 1;
  const resMembers = activeRes.members; // miembros con nombre/tipo resueltos (para ver su sueldo)
  const sociosNeg = r.manualDelta > 0.5 && (r.sAutil + r.sButil) < -0.5; // pagaste de más: socios en rojo
  const hayManual = resMembers.some((m) => typeof m.montoManual === "number"); // ¿algún sueldo tocado a mano?
  // Cálculo SIN ajustes a mano, para mostrar "era → ahora" (cuánto cambió tu utilidad).
  const rBase = hayManual ? compute({ ...activeRes, members: activeRes.members.map((m) => { const c = { ...m }; delete c.montoManual; return c; }) }, P) : r;
  const reglasDivergen = !active.borrador && !!active.reglas && reglasDifierenDinero(active.reglas, st.params);
  // "Equipo" = lo que REALMENTE aterriza en la Masa salarial por trabajar: la bolsa
  // menos el "sombrero de socio" (disc), que no se queda en el equipo sino que se va a
  // la Banca. Este mismo número (bolsaOut − disc) se usa en "El desglose" para que el %
  // del equipo COINCIDA en las dos vistas (antes barra=35% vs desglose=41%, bug de Balmo).
  // Comisión y bono del Núcleo se pintan como franjas propias (no dentro de Equipo) para
  // que barra y desglose sean idénticas franja por franja. Todo suma el ingreso exacto.
  const equipoNeto = r.bolsaOut - r.disc + r.manualDelta; // pago real al equipo (incluye ajustes a mano)
  const segs = [
    { k: "Equipo", v: equipoNeto, c: "--c-equipo" },
    { k: "Comisión", v: r.comisPaid, c: "--c-reserva" },
    { k: "Bono Núcleo", v: r.poolAmt, c: "--c-reserva" },
    { k: "Caja proyecto", v: Math.max(0, r.cajaProj), c: "--c-caja" },
    { k: "Banca", v: r.banca, c: "--c-banca" }, { k: P.nombreA, v: r.sAutil, c: "--c-andres" }, { k: P.nombreB, v: r.sButil, c: "--c-balmo" },
  ].filter((s) => s.v > 0.5);
  const totSeg = segs.reduce((s, x) => s + x.v, 0) || 1;
  const rows = Object.values(r.people).filter((x) => x.trabajo + x.extra + (x.comision || 0) > 0.5).sort((a, b) => (b.trabajo + b.extra + (b.comision || 0)) - (a.trabajo + a.extra + (a.comision || 0)) || order[a.quien] - order[b.quien]);
  // "Por mes" = la MISMA comparación (todos lado a lado), pero el monto de cada quien
  // ÷ meses (promedio mensual). No es el mes-a-mes por persona (ese siempre repite el
  // mismo número con reparto parejo, no sirve para comparar). Decisión Andrés 2026-07-19.
  const plazoN = Math.max(1, Math.floor(active.plazoMeses || 1));
  const rowsMes = rows.map((x) => ({ ...x, trabajo: x.trabajo / plazoN, extra: x.extra / plazoN, comision: (x.comision || 0) / plazoN }));
  // Unidad de TODA la Calculadora. Andrés firma el total pero opera en el MES:
  // por default se muestra lo del mes (÷ plazo) — tiles, desglose, "a dónde va" —
  // y el total queda a un clic. `f` escala cualquier monto de proyecto al mes.
  // Reparto parejo (Método A) ⇒ mes = total ÷ N. Decisión Andrés 2026-07-19.
  const esMulti = plazoN > 1;
  const porMes = esMulti && vistaCobro === "mes";
  const f = porMes ? 1 / plazoN : 1;
  const uLbl = porMes ? " · al mes" : "";
  let tT = 0, tE = 0, tC = 0; Object.values(r.people).forEach((a) => { tT += a.trabajo; tE += a.extra; tC += a.comision || 0; });
  // La comisión ahora vive en su propio campo (franjita naranja); se suma aparte al cuadre.
  const leak = r.t - (tT + tE + tC + r.cajaProj + r.banca);
  const mr = (r.marginOp - r.manualDelta) / t; // margen real que se queda CURVA (tras ajustes a mano)
  // ISR = % sobre la facturación (base). Sale de la utilidad de socios ANTES de dividir
  // entre ellos, así sus montos ya son netos. El ISR NO se reparte (se va al SAT).
  const isrRes = active.descontarISR && P.imp > 0 ? isrReservaDe(r.t, P) : 0;
  const netoSocios = r.utilKept - isrRes; // utilidad de socios ya sin ISR
  const bd = (cls: string, l: string, v: number) => <div className={"bd-row " + cls}><span className="bl">{l}</span><span className="bv"><span key={fmtMXN(v * f)} className="num-anim">{fmtMXN(v * f)}</span></span></div>;

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
            {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.borrador ? " · sin guardar" : ""}</option>)}
          </select>
        </div>
        <div className="pb-group grow">
          <span className="pb-cap">Nombre <span className="tip" data-tip="Cómo se llama este proyecto (ej. el cliente). Escríbelo aquí para renombrarlo."><Info /></span></span>
          <input type="text" value={active.nombre} placeholder="Nombre del proyecto" onChange={(e) => updateActive((p) => { p.nombre = e.target.value; })} />
        </div>
        <div className="pb-actions">
          <button className="btn" title="Empieza (o continúa) un borrador sin guardar" onClick={nuevoBorrador}><Plus size={15} /> Nuevo</button>
          {confirmDescartar
            ? <span className="pcard-delc">¿{active.borrador ? "Descartar borrador" : "Borrar proyecto"}? <button className="btn danger" onClick={active.borrador ? descartarBorrador : () => { update((s) => { s.projects = s.projects.filter((x) => x.id !== s.activeId); s.activeId = s.projects[0]?.id || ""; return s; }); setConfirmDescartar(false); }}>Sí</button><button className="btn ghost" onClick={() => setConfirmDescartar(false)}>No</button></span>
            : <button className="btn danger" title={active.borrador ? "Descarta este borrador" : "Borra el proyecto abierto"} onClick={() => setConfirmDescartar(true)}>{active.borrador ? "Descartar" : "Borrar"}</button>}
          <button className="btn primary" title={active.borrador ? "Guarda este proyecto y deja la Calculadora lista para el siguiente" : "Re-guarda este proyecto (congela sus reglas con las de hoy)"} onClick={guardarYNuevo}>{active.borrador ? <>Guardar proyecto <ArrowRight size={15} /></> : <>Actualizar <ArrowRight size={15} /></>}</button>
        </div>
      </div>

      {reglasDivergen && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          Estás calculando con las <b>Reglas de ahora</b>, distintas a las que guardaste. Pulsa <b>Actualizar</b> para recongelar este proyecto con las de hoy.
        </div>
      )}

      <div className="grid rise">
        <div className="sidec">
          <div className="card">
            <h2>El proyecto</h2>
            {(() => {
              // Solo 2 modos (decisión Andrés 2026-07-16): "sin" (no lleva IVA) y
              // "incluido" (descontar IVA). Se quitó "+ IVA encima". Proyectos viejos
              // con "mas" se muestran como "sin" (el reparto sigue sobre la misma base).
              const modo: "sin" | "incluido" = active.ivaModo === "incluido" ? "incluido" : "sin";
              const incluido = modo === "incluido";
              const conIVA = modo !== "sin";
              const inputVal = incluido ? Math.round(active.ticket * (1 + IVA) * 100) / 100 : active.ticket;
              // Al cambiar de botón, el NÚMERO que se ve en el campo se queda igual y solo
              // se reinterpreta: "Descontar IVA" lo trata como total (saca la base ÷1.16);
              // los otros lo tratan como base. Así el campo nunca "salta" al cambiar de modo.
              const setModo = (m: "sin" | "incluido") => updateActive((p) => {
                const oldIncluido = p.ivaModo === "incluido";
                const visible = oldIncluido ? Math.round(p.ticket * (1 + IVA) * 100) / 100 : p.ticket;
                p.ivaModo = m; p.conIVA = m !== "sin";
                p.ticket = m === "incluido" ? Math.round(ticketSinIVA(visible) * 100) / 100 : visible;
              });
              const onTicket = (v: number) => updateActive((p) => { p.ticket = incluido ? Math.round(ticketSinIVA(v) * 100) / 100 : v; });
              const base = active.ticket, iva = conIVA ? base * IVA : 0, total = base + iva;
              return (
                <>
                  <div className="field"><label>Precio del proyecto <span className="tip" data-tip="Escribe el total firmado una vez. Aunque sea a varios meses, aquí va el total; abajo y a la derecha ves lo del mes. El botón decide qué se hace con el IVA."><Info /></span></label>
                    <div className="money-in"><span>$</span><input type="number" value={inputVal} onChange={(e) => onTicket(+e.target.value || 0)} /></div>
                    {plazoN > 1 && <div className="price-mo">= <b>{fmtMXN(total / plazoN)}</b> / mes <span>· {plazoN} meses (total {fmtMXN(total)})</span></div>}
                  </div>
                  <div className="field"><label>Impuestos <span className="tip" data-tip="Cada botón es un interruptor: si no lo picas, no se descuenta. Descontar IVA = el precio que escribes YA trae IVA, la app saca la base (16%) y reparte solo esa base; el IVA es de Hacienda. Descontar ISR = aparta la tasa (editable en Reglas) sobre tu facturación (la base, sin IVA) para el SAT; sale del neto de socios y no mueve el reparto ni lo que paga el cliente."><Info /></span></label>
                    <div className="chips">
                      <button className="chip-btn" aria-pressed={conIVA} onClick={() => setModo(conIVA ? "sin" : "incluido")}>Descontar IVA</button>
                      <button className="chip-btn" aria-pressed={!!active.descontarISR} onClick={() => updateActive((p) => { p.descontarISR = !p.descontarISR; })}>Descontar ISR ({P.imp}%)</button>
                    </div>
                    <div className="iva-box">
                      <div className="iva-row"><span>Base (sin IVA){!active.descontarISR && <> <b className="iva-tag">se reparte</b></>}</span><b style={{ color: "var(--cobalt)" }}><span key={fmtMXN(base)} className="num-anim">{fmtMXN(base)}</span></b></div>
                      <div className="iva-row muted"><span>IVA (16%){conIVA ? "" : " · apagado"}</span><span key={fmtMXN(iva)} className="num-anim">{fmtMXN(iva)}</span></div>
                      <div className="iva-row total"><span>Total que paga el cliente</span><b><span key={fmtMXN(total)} className="num-anim">{fmtMXN(total)}</span></b></div>
                      {active.descontarISR && <div className="iva-row muted"><span>ISR reservado ({P.imp}% de la base) · para el SAT</span><span key={fmtMXN(isrReservaDe(r.t, P))} className="num-anim">−{fmtMXN(isrReservaDe(r.t, P))}</span></div>}
                      {active.descontarISR && P.imp > 0 && <div className="iva-row total"><span>Se reparte <b className="iva-tag">después de ISR</b></span><b style={{ color: "var(--pos)" }}><span key={fmtMXN(base - isrReservaDe(base, P))} className="num-anim">{fmtMXN(base - isrReservaDe(base, P))}</span></b></div>}
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="grp-sep">Forma del proyecto</div>
            <div className="two" style={{ gap: 12 }}>
              <div className="field"><label>Plazo (meses)</label><input type="number" min={1} max={24} step={1} value={active.plazoMeses ?? 1} onChange={(e) => updateActive((p) => { p.plazoMeses = Math.max(1, Math.floor(+e.target.value) || 1); })} /></div>
              <div className="field"><label>Arranca</label><input type="date" value={active.fechaInicio ?? todayISO()} onChange={(e) => updateActive((p) => { p.fechaInicio = e.target.value; })} /></div>
            </div>
            <div className="field"><label>Tipo</label><div className="chips">{(["trazo", "trayectoria", "alianza"] as const).map((tp) => <button key={tp} className="chip-btn" aria-pressed={active.tipo === tp} onClick={() => updateActive((p) => { p.tipo = tp; p.cajaPct = cajaPresetDe(st.params)[tp]; })}>{tp[0].toUpperCase() + tp.slice(1)}</button>)}</div></div>
            <div className="grp-sep">Origen &amp; caja</div>
            {(() => {
              const comisPot = Math.min(Math.max(0, r.marginBruto) * (P.comisPct / 100), P.comisTope);
              const o = active.origen || "empresa";
              const comisEsManual = typeof active.comisManual === "number";
              const detalle = o === "empresa"
                ? `La marca lo trajo → sin comisión: ese ${P.comisPct}% se queda dentro y engorda la utilidad de los socios.`
                : o === "socio"
                ? `Un socio lo trajo → la comisión (${fmtMXN(comisPot)}) va a la Banca, no a un bolsillo — pagársela a un socio le quitaría al otro.`
                : `Alguien del equipo lo trajo → esa persona cobra la comisión (${fmtMXN(comisPot)}) por conseguir al cliente, sin diluir a nadie.`;
              return (
                <div className="field"><label>¿Quién trajo este cliente? <span className="tip" data-tip={`Decide quién se lleva la comisión (${P.comisPct}% del margen) por conseguir al cliente. No cambia lo que paga el cliente, solo a dónde va. · ${detalle}`}><Info /></span></label>
                  <div className="chips">
                    <button className="chip-btn" aria-pressed={o === "empresa"} onClick={() => updateActive((p) => { p.origen = "empresa"; })}>La marca</button>
                    <button className="chip-btn" aria-pressed={o === "socio"} onClick={() => updateActive((p) => { p.origen = "socio"; })}>Un socio</button>
                    <button className="chip-btn" aria-pressed={o === "persona"} onClick={() => updateActive((p) => { p.origen = "persona"; })}>Equipo</button>
                  </div>
                  {o === "persona" && (
                    <select style={{ marginTop: 8 }} value={active.origenPersona || ""} onChange={(e) => updateActive((p) => { p.origenPersona = e.target.value; })}>
                      <option value="">— ¿quién lo trajo? —</option>
                      {nombresEquipo.map((n, i) => <option key={i} value={n}>{n}</option>)}
                    </select>
                  )}
                  {o !== "empresa" && (
                    <div className={"member-pay" + (comisEsManual ? " on" : "")} style={{ marginTop: 10 }}>
                      <span className="mp-l">Comisión {comisEsManual && <b className="mp-tag">a mano</b>}<span className="tip" data-tip={`Por default es el ${P.comisPct}% del margen (tope ${fmtMXN(P.comisTope)}). Ponla a mano si solo aplica al primer pago o quieres otro monto.`}><Info /></span></span>
                      <div className="money-in sm"><span>$</span><input type="number" min={0} value={Math.round(r.comis)} onChange={(e) => updateActive((p) => { p.comisManual = Math.max(0, Math.round(+e.target.value || 0)); })} title="Escribe la comisión exacta (ej. solo la del primer pago)." /></div>
                      <button className="mp-auto" disabled={!comisEsManual} title={comisEsManual ? `Volver al ${P.comisPct}% automático` : "Cálculo automático"} onClick={() => updateActive((p) => { delete p.comisManual; })}>{comisEsManual ? "auto" : "auto ✓"}</button>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="field"><label>Caja del proyecto <span style={{ color: "var(--cobalt)", fontFamily: "var(--mono)", fontWeight: 700 }}>{active.cajaPct}%</span></label><input type="range" min={0} max={25} value={active.cajaPct} onChange={(e) => updateActive((p) => { p.cajaPct = +e.target.value; })} /></div>
            <div className="grp-sep">Cliente</div>
            <div className="field"><label>Cliente (de Notion)</label><select value={active.clienteId || ""} onChange={(e) => updateActive((p) => { p.clienteId = e.target.value || null; p.clienteNombre = clientes.find((c) => c.id === e.target.value)?.nombre || null; })}><option value="">— sin asignar —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="field"><label>¿Qué le vendes? <span className="tip" data-tip="Los entregables/alcance del proyecto, uno por línea. Aparecen en la cotización que le mandas al cliente."><Info /></span></label>
              <textarea value={active.cotScope || ""} placeholder={"Ej.:\nDiagnóstico y estrategia\nDiseño de la solución\nImplementación y acompañamiento"} rows={4} onChange={(e) => updateActive((p) => { p.cotScope = e.target.value; })} style={{ width: "100%", padding: "11px 13px", fontSize: 14, fontFamily: "var(--sans)", background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--border-2)", borderRadius: "var(--r-sm)", resize: "vertical", lineHeight: 1.5 }} />
            </div>
            <button className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => window.open("/pdf/cotizacion?proyecto=" + active.id, "_blank")} disabled={active.borrador} title={active.borrador ? "Guarda el proyecto primero" : "Cotización lista para el cliente"}><FileText size={15} /> Cotización para el cliente</button>
          </div>
          <div className="card">
            <h2>El equipo del proyecto <span className="tip" data-tip="Elige a cada persona del equipo — la app ya sabe si es socio o Núcleo. Agrega o renombra gente en Reglas › Personas."><Info /></span></h2>
            <div className={"team-impact" + (hayManual ? " on" : "")}>
              <div className="ti-item"><span>CURVA{porMes ? "/mes" : ""}</span><b><span key={fmtMXN((r.marginOp - r.manualDelta) * f)} className="num-anim">{fmtMXN((r.marginOp - r.manualDelta) * f)}</span></b>{hayManual && <em>era {fmtMXN(rBase.marginOp * f)}</em>}</div>
              <div className="ti-item"><span>{P.nombreA}</span><b style={{ color: r.socioA < -0.5 ? "var(--danger)" : "var(--c-andres)" }}><span key={fmtMXN(r.socioA * f)} className="num-anim">{fmtMXN(r.socioA * f)}</span></b>{hayManual && <em>era {fmtMXN(rBase.socioA * f)}</em>}</div>
              <div className="ti-item"><span>{P.nombreB}</span><b style={{ color: r.socioB < -0.5 ? "var(--danger)" : "var(--c-balmo)" }}><span key={fmtMXN(r.socioB * f)} className="num-anim">{fmtMXN(r.socioB * f)}</span></b>{hayManual && <em>era {fmtMXN(rBase.socioB * f)}</em>}</div>
            </div>
            {active.members.map((m, i) => {
              const val = personVal(m);
              const res = resMembers[i];
              const esSocioM = !!res && isSocio(res.quien); // socio trabajando el proyecto
              const pay = res ? (r.people[res.nombre + "|" + res.quien]?.trabajo || 0) : 0; // pago por trabajar (sombrero si es socio)
              const mensual = plazoN > 1 ? pay / plazoN : pay;
              const manual = typeof m.montoManual === "number";
              const setManual = (mesVal: number) => updateActive((p) => { p.members[i].montoManual = Math.max(0, Math.round(mesVal)) * plazoN; p.manualOK = false; });
              const clearManual = () => updateActive((p) => { delete p.members[i].montoManual; p.manualOK = false; });
              return (
              <div className="member2" key={i}>
                <select value={val} onChange={(e) => choosePerson(i, e.target.value)}>
                  <optgroup label="Socios"><option value="socioA">{P.nombreA}</option><option value="socioB">{P.nombreB}</option></optgroup>
                  {st.roster.length > 0 && <optgroup label="Equipo">{st.roster.map((rp) => <option key={rp.id} value={rp.id}>{rp.nombre}</option>)}</optgroup>}
                  {val === "__cur" && <option value="__cur">{m.nombre || "— sin asignar —"}</option>}
                  <option value="__new">+ Nueva persona…</option>
                </select>
                <div className="member-rol">
                  <div className="chips">
                    {(["P", "E", "A"] as Rol[]).map((rl) => (
                      <button key={rl} className="chip-btn" aria-pressed={m.rol === rl} onClick={() => updateActive((p) => { p.members[i].rol = rl; })}>{ROLNAME[rl]}</button>
                    ))}
                  </div>
                  <button className="rmv" title="Quitar del proyecto" onClick={() => updateActive((p) => { p.members.splice(i, 1); })}>×</button>
                </div>
                {res && (
                  <div className={"member-pay" + (manual ? " on" : "")}>
                    <span className="mp-l">{esSocioM ? "Tu trabajo" : "Gana"}{plazoN > 1 ? "/mes" : ""} {manual && <b className="mp-tag">a mano</b>}<span className="tip" data-tip={esSocioM ? "Lo que cobras por TRABAJAR este proyecto (tu sombrero) — aparte de tu utilidad de socio. Edítalo a mano; la diferencia sale de la utilidad de los socios." : "Lo que gana por trabajar. Edítalo a mano y el extra sale de la utilidad de los socios."}><Info /></span></span>
                    <div className="money-in sm"><span>$</span><input type="number" min={0} value={Math.round(mensual)} onChange={(e) => setManual(+e.target.value || 0)} title="Escribe cuánto quieres que gane; el resto se ajusta y el extra sale de la utilidad de los socios." /></div>
                    <button className="mp-auto" disabled={!manual} title={manual ? "Volver al cálculo automático" : "Cálculo automático"} onClick={clearManual}>{manual ? "auto" : "auto ✓"}</button>
                  </div>
                )}
              </div>
              );
            })}
            {Math.abs(r.manualDelta) > 0.5 && <p className="hint" style={{ marginTop: 4, color: sociosNeg ? "var(--danger)" : undefined, fontWeight: sociosNeg ? 600 : undefined }}>Ajuste a mano: {r.manualDelta > 0
              ? <><b>{fmtMXN(r.manualDelta)}</b> extra al equipo, sale de la utilidad de {P.nombreA} y {P.nombreB}{sociosNeg ? " — les queda en NEGATIVO, estás pagando más de lo que deja el proyecto." : "."}</>
              : <><b>{fmtMXN(-r.manualDelta)}</b> menos al equipo — esa utilidad vuelve a {P.nombreA} y {P.nombreB}.</>}</p>}
            <button className="add" onClick={addMember}>+ Agregar persona</button>
          </div>
          <AgendaEditor active={active} st={st} P={P} updateActive={updateActive} />
        </div>

        <div>
          {esMulti && (
            <div className="unit-bar">
              <span className="unit-cap">Ver</span>
              <div className="chips">
                <button className="chip-btn sm" aria-pressed={porMes} onClick={() => setVistaCobro("mes")}>Por mes</button>
                <button className="chip-btn sm" aria-pressed={!porMes} onClick={() => setVistaCobro("total")}>Total</button>
              </div>
              <span className="unit-sub">{porMes ? `todo lo de abajo es del mes · ${plazoN} meses` : `proyecto completo · ${plazoN} meses`}</span>
            </div>
          )}
          <div className="tiles rise">
            <Tile k="k-curva" l={porMes ? "CURVA se queda / mes" : "CURVA se queda"} v={fmtMXN((r.marginOp - r.manualDelta) * f)} p={`${pctFmt((r.marginOp - r.manualDelta) / t)} del ingreso${uLbl}`} tip="Lo que le queda a CURVA (utilidad de socios + Banca) después de pagarle al equipo (incluye ajustes manuales), la comisión y apartar la caja del proyecto." />
            <Tile k="k-a" l={r.sAseat > 0 ? `${P.nombreA} · trabaja` : P.nombreA} v={fmtMXN(r.socioA * f)} p={r.sAseat > 0 ? `sombrero ${fmtMXN(r.sAseat * f)}${uLbl}` : `socio ${P.split}%${uLbl}`} tip={`Todo lo que gana ${P.nombreA} en este proyecto: su utilidad de socio${r.sAseat > 0 ? " + lo que cobra por trabajarlo (sombrero)" : ""}.`} />
            <Tile k="k-b" l={r.sBseat > 0 ? `${P.nombreB} · trabaja` : P.nombreB} v={fmtMXN(r.socioB * f)} p={r.sBseat > 0 ? `sombrero ${fmtMXN(r.sBseat * f)}${uLbl}` : `socio ${100 - P.split}%${uLbl}`} tip={`Todo lo que gana ${P.nombreB} en este proyecto: su utilidad de socio${r.sBseat > 0 ? " + lo que cobra por trabajarlo (sombrero)" : ""}.`} />
            <Tile k="k-banca" l={porMes ? "A la Banca / mes" : "A la Banca"} v={fmtMXN(r.banca * f)} p={`ahorro CURVA${uLbl}`} tip="El colchón de ahorro de CURVA que genera este proyecto (caja de ahorro + descuentos de socio). No es de nadie: es la reserva de la empresa." />
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Cuánto cobra cada quien{porMes ? " · al mes" : esMulti ? " · en total" : ""}</h2>
              <button className="btn ghost sm" title="Ve los sueldos del mes de todos, juntando este proyecto con los demás vivos" onClick={() => setSimDrawer(true)}><Users size={14} /> Con los demás</button>
            </div>
            {porMes ? <Rank rows={rowsMes} /> : <Rank rows={rows} />}
            {esMulti && <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              {porMes
                ? <>Lo que gana cada quien <b>cada mes</b> (parejo los {plazoN} meses). Cambia a <b>Total</b> arriba para ver los {plazoN} meses juntos.</>
                : <>Total de los {plazoN} meses. Cambia a <b>Por mes</b> arriba para ver el ingreso mensual de cada quien.</>}
            </p>}
            <div className="health" style={{ marginTop: 16 }}>
              <span className={"hpill " + (Math.abs(leak) < 1 ? "ok" : "bad")}>{Math.abs(leak) < 1 ? "Cuadra a $0" : "Descuadre"}</span>
              <span className={"hpill " + ((r.marginOp - r.manualDelta) >= (r.bolsaOut + r.manualDelta) ? "ok" : "warn")}>{(r.marginOp - r.manualDelta) >= (r.bolsaOut + r.manualDelta) ? "CURVA ≥ equipo" : "Equipo se lleva más"}</span>
              <span className={"hpill " + (mr >= 0.4 ? "ok" : mr >= 0.25 ? "warn" : "bad")}>{mr >= 0.4 ? "Sano" : mr >= 0.25 ? "Justo" : "Bajo"} ({pctFmt(mr)})</span>
              <span className="tip" data-tip="Montos brutos (antes de ISR). El neto real está en el Panel y en Personas."><Info /></span>
            </div>
          </div>

          <button className="disclosure" aria-expanded={verDesglose} onClick={() => setVerDesglose((v) => !v)}>
            {verDesglose ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="disc-t">{verDesglose ? "Ocultar" : "Ver"} el desglose completo</span>
            <span className="disc-sub">{porMes ? "al mes · " : ""}estado de resultados · a dónde va cada peso</span>
          </button>

          {verDesglose && (
            <div className="disc-body">
              <div className="card"><h2>El desglose · estado de resultados{porMes ? " · al mes" : ""}</h2>
                {bd("", "Ingreso del proyecto", r.t)}
                {isrRes > 0.5 && bd("sub", `− ISR (${P.imp}% · RESICO, al SAT — no se reparte)`, -isrRes)}
                {isrRes > 0.5 && bd("eq", "Queda para repartir (después de ISR)", r.t - isrRes)}
                {bd("sub", `− Pago al equipo (${pctFmt((r.bolsaOut - r.disc) / (r.t || 1))})`, -(r.bolsaOut - r.disc))}
                {r.disc > 0.5 && bd("sub", "− Sombrero de socio (reserva a Banca)", -r.disc)}
                {r.comis > 0.5 && bd("sub", `− Comisión de origen ${r.comisBanca > 0.5 ? "(a Banca)" : "→ " + (active.origenPersona || "quien lo trajo")}`, -r.comis)}
                {bd("eq", "Utilidad bruta", r.t - isrRes - r.bolsaOut - r.comis)}
                {bd("sub", "− Caja del proyecto", -r.cajaProj)}
                {bd("eq", "Utilidad operativa", r.marginOp - isrRes)}
                {r.cajaAhorro > 0.5 && bd("sub", "− Caja de ahorro (reserva a Banca)", -r.cajaAhorro)}
                {r.utilSwept > 0.5 && bd("sub", "− Barrido de utilidad (a Banca)", -r.utilSwept)}
                {r.poolAmt > 0.5 && bd("sub", "− Bono del Núcleo", -r.poolAmt)}
                {Math.abs(r.manualDelta) > 0.5 && bd("sub", r.manualDelta > 0 ? "− Extra al equipo (a mano)" : "+ Menos sueldo al equipo (a mano)", -r.manualDelta)}
                {bd("strong", `Utilidad a repartir (socios)${isrRes > 0.5 ? " · ya sin ISR" : ""}`, netoSocios)}
                {bd("sub", `→ ${P.nombreA} (${P.split}%)`, netoSocios * P.split / 100)}
                {bd("sub", `→ ${P.nombreB} (${100 - P.split}%)`, netoSocios * (100 - P.split) / 100)}
              </div>
              <div className="card">
                <h2>A dónde va cada peso del ingreso{porMes ? " · al mes" : ""}</h2>
                <div className="stack">{segs.map((s) => <div key={s.k} className="seg" title={`${s.k} ${fmtMXN(s.v * f)}`} style={{ flex: `0 0 ${s.v / totSeg * 100}%`, background: `var(${s.c})` }} />)}</div>
                <div className="legend">{segs.map((s) => <span key={s.k} className="lg"><span className="dot" style={{ background: `var(${s.c})` }} /><span className="ln">{s.k}</span><span key={fmtMXN(s.v * f)} className="lv num-anim">{fmtMXN(s.v * f)}</span><span className="lp">{pctFmt(s.v / totSeg)}</span></span>)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <button className="fab-reglas" title="Ajustar reglas sin salir (se recalcula en vivo)" onClick={() => setReglasDrawer(true)}><SlidersHorizontal size={16} /> Ajustar reglas</button>
      {reglasDrawer && (
        <ReglasDrawer st={st} update={update} setSec={setSec} onClose={() => setReglasDrawer(false)}
          preview={[
            { l: porMes ? "CURVA / mes" : "CURVA se queda", v: fmtMXN(r.marginOp * f), c: "--pos" },
            { l: P.nombreA, v: fmtMXN(r.socioA * f), c: "--c-andres" },
            { l: P.nombreB, v: fmtMXN(r.socioB * f), c: "--c-balmo" },
            { l: porMes ? "Banca / mes" : "A la Banca", v: fmtMXN(r.banca * f), c: "--c-banca" },
          ]} />
      )}
      {simDrawer && <SimulacionDrawer st={st} active={active} onClose={() => setSimDrawer(false)} />}
    </>
  );
}

/* ---------------- Cotizador (precio ↔ lo que gana cada quien) ---------------- */
// Sección hermana de la Calculadora: MISMO proyecto activo, pero enfocada en UNA
// decisión — ¿cuánto cobrar? Pones el precio y ves, lado a lado, lo que paga el
// cliente y lo que gana cada quien. El explorador "¿y si cobras…?" recalcula el
// reparto a varios precios para no cotizar ni de más ni de menos. Los parámetros
// finos (comisión, ISR, caja, reglas) viven en la Calculadora. Decisión Andrés 2026-07-23.
function Cotizador({ st, active, clientes, update, updateActive, setSec, setToast, log }: {
  st: State; active: Proyecto; clientes: Cliente[];
  update: (fn: (s: State) => State) => void; updateActive: (fn: (p: Proyecto) => void) => void; setSec: (s: string) => void; setToast: (m: string) => void; log?: (act: string, det: string) => void;
}) {
  const nuevoBorrador = () => update((s) => {
    const ex = s.projects.find((x) => x.borrador);
    if (ex) { s.activeId = ex.id; return s; }
    const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id;
    return s;
  });
  const guardar = () => {
    const cur0 = st.projects.find((x) => x.id === st.activeId);
    const eraBorrador = !!cur0?.borrador;
    const nombre = (cur0?.nombre || "El proyecto").trim();
    update((s) => {
      const cur = s.projects.find((x) => x.id === s.activeId);
      if (cur) { cur.borrador = false; cur.reglas = { ...s.params }; }
      if (eraBorrador) { const nb = makeDraft(s.projects); s.projects.push(nb); s.activeId = nb.id; }
      return s;
    });
    setToast(eraBorrador ? `“${nombre}” guardado` : `“${nombre}” actualizado`);
    log?.(eraBorrador ? "guardó un proyecto" : "actualizó un proyecto", nombre);
  };
  if (!active) return (
    <>
      <div className="page-h"><div><h1>Cotizador</h1><p>Pon el precio y ve, al instante, lo que gana cada quien.</p></div></div>
      <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>No tienes proyectos todavía.</p>
        <button className="btn primary" onClick={nuevoBorrador}>+ Crear el primero</button>
      </div>
    </>
  );

  const P = st.params;
  const activeRes = membersResolved(active, st.roster, P);
  const r = compute(activeRes, P);
  const t = r.t || 1;
  const plazoN = Math.max(1, Math.floor(active.plazoMeses || 1));
  const conIVA = active.ivaModo === "incluido" || (active.ivaModo !== "sin" && !!active.conIVA);
  const base = active.ticket;
  const total = conIVA ? Math.round(base * (1 + IVA) * 100) / 100 : base;
  const rows = Object.values(r.people).filter((x) => x.trabajo + x.extra + (x.comision || 0) > 0.5).sort((a, b) => (b.trabajo + b.extra + (b.comision || 0)) - (a.trabajo + a.extra + (a.comision || 0)) || order[a.quien] - order[b.quien]);
  const mr = (r.marginOp - r.manualDelta) / t;           // margen que se queda CURVA
  const curva = r.marginOp - r.manualDelta;

  // Explorador: recalcula el reparto a varios precios (misma base ± %). Al hacer
  // clic fija ese precio. Así ves de un vistazo el costo de cobrar de menos.
  const puntos = [-0.15, -0.1, 0, 0.1, 0.2, 0.3];
  const explor = puntos.map((d) => {
    const nt = Math.max(0, Math.round(base * (1 + d)));
    const rr = compute(membersResolved({ ...active, ticket: nt }, st.roster, P), P);
    return { d, nt, tot: conIVA ? Math.round(nt * (1 + IVA)) : nt, curva: rr.marginOp - rr.manualDelta, mr: (rr.marginOp - rr.manualDelta) / (rr.t || 1) };
  });

  // ── Selector de personas (mismo patrón que la Calculadora) ──
  const personVal = (m: Miembro): string => {
    if (m.personId === "socioA" || m.quien === "socioA") return "socioA";
    if (m.personId === "socioB" || m.quien === "socioB") return "socioB";
    if (m.personId && st.roster.some((rp) => rp.id === m.personId)) return m.personId;
    const byName = st.roster.find((rp) => rp.nombre === m.nombre);
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
      else { const rp = st.roster.find((rp2) => rp2.id === id); if (rp) { m.personId = rp.id; m.quien = rp.quien; m.nombre = rp.nombre; m.sm = rp.quien === "nuevo" ? P.smNuevo : 1; } }
    });
  };
  const addMember = () => updateActive((p) => {
    const used = new Set(p.members.map((m) => m.personId));
    const rp = st.roster.find((rp2) => !used.has(rp2.id)) || st.roster[0];
    if (rp) p.members.push({ rol: "A", quien: rp.quien, nombre: rp.nombre, sm: rp.quien === "nuevo" ? P.smNuevo : 1, personId: rp.id });
    else p.members.push({ rol: "A", quien: "socioA", nombre: P.nombreA, sm: 1, personId: "socioA" });
  });

  const setModo = (m: "sin" | "incluido") => updateActive((p) => {
    const oldIncluido = p.ivaModo === "incluido";
    const visible = oldIncluido ? Math.round(p.ticket * (1 + IVA) * 100) / 100 : p.ticket;
    p.ivaModo = m; p.conIVA = m !== "sin";
    p.ticket = m === "incluido" ? Math.round(ticketSinIVA(visible) * 100) / 100 : visible;
  });
  const inputVal = conIVA ? Math.round(base * (1 + IVA) * 100) / 100 : base;
  const onTicket = (v: number) => updateActive((p) => { p.ticket = conIVA ? Math.round(ticketSinIVA(v) * 100) / 100 : v; });

  return (
    <>
      <div className="page-h"><div><h1>Cotizador</h1><p>Pon el precio y mira, al instante, lo que gana cada quien.</p></div></div>
      <div className="proj-bar">
        <div className="pb-group">
          <span className="pb-cap">Proyecto</span>
          <select value={active.id} onChange={(e) => update((s) => { s.activeId = e.target.value; return s; })}>
            {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.borrador ? " · sin guardar" : ""}</option>)}
          </select>
        </div>
        <div className="pb-group grow">
          <span className="pb-cap">Nombre</span>
          <input type="text" value={active.nombre} placeholder="Cliente o proyecto" onChange={(e) => updateActive((p) => { p.nombre = e.target.value; })} />
        </div>
        <div className="pb-actions">
          <button className="btn" title="Empieza (o continúa) un borrador" onClick={nuevoBorrador}><Plus size={15} /> Nuevo</button>
          <button className="btn primary" title={active.borrador ? "Guarda este proyecto" : "Re-guarda con las reglas de hoy"} onClick={guardar}>{active.borrador ? <>Guardar <ArrowRight size={15} /></> : <>Actualizar <ArrowRight size={15} /></>}</button>
        </div>
      </div>

      {/* El corazón del Cotizador: precio al cliente ↔ lo que se reparte, lado a lado. */}
      <div className="cotz-hero rise">
        <div className="cotz-side pays">
          <span className="cotz-lbl">El cliente paga</span>
          <span className="cotz-big"><span key={fmtMXN(total)} className="num-anim">{fmtMXN(total)}</span></span>
          <span className="cotz-sub">{conIVA ? "IVA incluido" : "sin IVA"}{plazoN > 1 ? ` · ${plazoN} pagos de ${fmtMXN(total / plazoN)}` : ""}</span>
        </div>
        <div className="cotz-flow"><ArrowRight size={20} /></div>
        <div className="cotz-side keeps">
          <span className="cotz-lbl">CURVA se queda</span>
          <span className="cotz-big"><span key={fmtMXN(curva)} className="num-anim">{fmtMXN(curva)}</span></span>
          <span className="cotz-sub">{pctFmt(mr)} del ingreso · {P.nombreA} {fmtMXN(r.socioA)} · {P.nombreB} {fmtMXN(r.socioB)}</span>
        </div>
      </div>

      <div className="grid rise">
        <div className="sidec">
          <div className="card">
            <h2>La propuesta</h2>
            <div className="field"><label>Cliente</label><select value={active.clienteId || ""} onChange={(e) => updateActive((p) => { p.clienteId = e.target.value || null; p.clienteNombre = clientes.find((c) => c.id === e.target.value)?.nombre || null; })}><option value="">— sin asignar —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="field"><label>Precio</label>
              <div className="money-in"><span>$</span><input type="number" value={inputVal} onChange={(e) => onTicket(+e.target.value || 0)} /></div>
              <div className="chips" style={{ marginTop: 8 }}>
                <button className="chip-btn" aria-pressed={conIVA} onClick={() => setModo(conIVA ? "sin" : "incluido")}>{conIVA ? "El precio ya trae IVA" : "El precio no lleva IVA"}</button>
              </div>
            </div>
            <div className="two" style={{ gap: 12 }}>
              <div className="field"><label>Plazo (meses)</label><input type="number" min={1} max={24} step={1} value={active.plazoMeses ?? 1} onChange={(e) => updateActive((p) => { p.plazoMeses = Math.max(1, Math.floor(+e.target.value) || 1); })} /></div>
              <div className="field"><label>Tipo</label><select value={active.tipo} onChange={(e) => updateActive((p) => { const tp = e.target.value as "trazo" | "trayectoria" | "alianza"; p.tipo = tp; p.cajaPct = cajaPresetDe(st.params)[tp]; })}>{(["trazo", "trayectoria", "alianza"] as const).map((tp) => <option key={tp} value={tp}>{tp[0].toUpperCase() + tp.slice(1)}</option>)}</select></div>
            </div>
            <div className="field"><label>¿Qué le vendes? <span className="tip" data-tip="Los entregables, uno por línea. Aparecen en la cotización que le mandas al cliente."><Info /></span></label>
              <textarea value={active.cotScope || ""} placeholder={"Un entregable por línea…"} rows={4} onChange={(e) => updateActive((p) => { p.cotScope = e.target.value; })} className="cotz-scope" />
            </div>
            <button className="btn ghost" style={{ width: "100%" }} onClick={() => window.open("/pdf/cotizacion?proyecto=" + active.id, "_blank")} disabled={active.borrador} title={active.borrador ? "Guarda el proyecto primero" : "Cotización lista para el cliente"}><FileText size={15} /> Cotización para el cliente</button>
          </div>
          <div className="card">
            <h2>Quién iría en el equipo <span className="tip" data-tip="Elige a cada persona; la app ya sabe si es socio o Núcleo. Afina sueldos, comisión e ISR en la Calculadora."><Info /></span></h2>
            {active.members.map((m, i) => {
              const val = personVal(m);
              return (
                <div className="member2" key={i}>
                  <select value={val} onChange={(e) => choosePerson(i, e.target.value)}>
                    <optgroup label="Socios"><option value="socioA">{P.nombreA}</option><option value="socioB">{P.nombreB}</option></optgroup>
                    {st.roster.length > 0 && <optgroup label="Equipo">{st.roster.map((rp) => <option key={rp.id} value={rp.id}>{rp.nombre}</option>)}</optgroup>}
                    {val === "__cur" && <option value="__cur">{m.nombre || "— sin asignar —"}</option>}
                    <option value="__new">+ Nueva persona…</option>
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
            <p className="hint" style={{ marginBottom: 0 }}>Afina sueldos, comisión e ISR en la <b style={{ cursor: "pointer", color: "var(--cobalt)" }} onClick={() => setSec("calculadora")}>Calculadora</b>.</p>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Se reparte así{plazoN > 1 ? " · en total" : ""}</h2>
            <Rank rows={rows} />
            {plazoN > 1 && <p className="hint" style={{ marginBottom: 0 }}>Total de los {plazoN} meses. El promedio mensual está en la Calculadora.</p>}
          </div>
          <div className="card">
            <h2>¿Y si cobras…? <span className="tip" data-tip="Mismo equipo, distinto precio. La barra crece con los pesos que se queda CURVA; el color marca si el margen es sano. Haz clic en una fila para fijar ese precio."><Info /></span></h2>
            <div className="cotz-explor">
              <div className="cx-head"><span>Precio al cliente</span><span>Lo que entra a CURVA</span><span>Se queda</span></div>
              {(() => {
                const maxCurva = Math.max(1, ...explor.map((e) => e.curva));
                return explor.map((e, i) => {
                  const isCur = Math.abs(e.d) < 0.001;
                  const col = e.mr >= 0.4 ? "var(--pos)" : e.mr >= 0.25 ? "var(--warn)" : "var(--neg)";
                  return (
                    <button key={i} className={"cx-row" + (isCur ? " cur" : "")} onClick={() => { if (!isCur) updateActive((p) => { p.ticket = e.nt; }); }} disabled={isCur} title={isCur ? "Precio actual" : "Fijar este precio"}>
                      <span className="cx-price">{fmtMXN(e.tot)}<em>{e.d === 0 ? "hoy" : (e.d > 0 ? "+" : "") + Math.round(e.d * 100) + "%"}</em></span>
                      <span className="cx-bar"><i style={{ width: Math.max(4, Math.min(100, e.curva / maxCurva * 100)) + "%", background: col }} /></span>
                      <span className="cx-curva" style={{ color: col }}>{fmtMXN(e.curva)}<em>{pctFmt(e.mr)} margen</em></span>
                    </button>
                  );
                });
              })()}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>El margen % casi no cambia con el precio (todo escala parejo). Lo que sí cambia son los <b>pesos</b> que entran: cobrar de menos es dinero que dejas en la mesa.</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- Proyectos (control de pagos) ---------------- */
// El "gorro" (rol) de cada quien, con color propio para el tablero.
const GORRA_COLOR: Record<Rol, string> = { P: "--cobalt", E: "--c-banca", A: "--muted" };
const GORRA_SHORT: Record<Rol, string> = { P: "Piloto", E: "Especialista", A: "Apoyo" };
const inicial = (n: string) => (n || "?").trim().slice(0, 1).toUpperCase();

/* Tablero del equipo: matriz personas × proyectos, cada celda con la "gorra"
   (Piloto/Especialista/Apoyo) a color. Ordenado por carga (más chamba arriba,
   libres abajo). Responde de un vistazo: ¿dónde está cada quien y quién trae
   más o menos carga? Encargo Andrés 2026-07-23. */
function TableroEquipo({ st }: { st: State }) {
  const P = st.params;
  const PESO: Record<Rol, number> = { P: P.pesoP, E: P.pesoE, A: P.pesoA };
  const vivos = st.projects.filter((p) => (p.estado ?? "cotizacion") !== "cancelado" && !p.borrador);

  type Alloc = { rol: Rol; monto: number; cerrado: boolean };
  type Row = { key: string; nombre: string; quien: Quien; allocs: Record<string, Alloc>; carga: number; monto: number; nproy: number };
  const rowsMap: Record<string, Row> = {};
  vivos.forEach((p) => {
    const R = reglasDe(p, P);
    const res = membersResolved(p, st.roster, R);
    const r = compute(res, R);
    const cerrado = (p.estado ?? "") === "cerrado";
    res.members.forEach((m) => {
      const key = m.nombre + "|" + m.quien;
      const row = rowsMap[key] || (rowsMap[key] = { key, nombre: m.nombre, quien: m.quien, allocs: {}, carga: 0, monto: 0, nproy: 0 });
      const monto = r.people[key]?.trabajo || 0;
      const ex = row.allocs[p.id];
      // Si aparece dos veces en el proyecto, nos quedamos con la gorra de más peso.
      if (!ex) { row.allocs[p.id] = { rol: m.rol, monto, cerrado }; row.nproy += 1; row.monto += monto; }
      else if (PESO[m.rol] > PESO[ex.rol]) ex.rol = m.rol;
    });
  });
  // Personas del roster sin proyecto → disponibles (para ver "quién tiene menos chamba").
  st.roster.forEach((rp) => { const key = rp.nombre + "|" + rp.quien; if (!rowsMap[key]) rowsMap[key] = { key, nombre: rp.nombre, quien: rp.quien, allocs: {}, carga: 0, monto: 0, nproy: 0 }; });
  Object.values(rowsMap).forEach((row) => { row.carga = Object.values(row.allocs).reduce((s, a) => s + PESO[a.rol], 0); });
  const rows = Object.values(rowsMap).sort((a, b) => b.carga - a.carga || b.nproy - a.nproy || order[a.quien] - order[b.quien] || a.nombre.localeCompare(b.nombre));
  const maxCarga = Math.max(1, ...rows.map((r) => r.carga));
  const conChamba = rows.filter((r) => r.nproy > 0);
  const libres = rows.filter((r) => r.nproy === 0);
  const cargaClass = (c: number) => c === 0 ? "libre" : c >= maxCarga * 0.66 ? "alta" : c >= maxCarga * 0.34 ? "media" : "baja";
  const cols = `minmax(140px,190px) repeat(${Math.max(1, vivos.length)}, minmax(96px,1fr)) minmax(116px,140px)`;

  if (vivos.length === 0) return <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}><p className="hint" style={{ marginTop: 0 }}>Aún no hay proyectos con equipo. Arma uno en la <b>Calculadora</b>.</p></div>;

  return (
    <div className="teamboard rise">
      <div className="tb-legend">
        <span className="tb-leg-t">Gorras:</span>
        {(["P", "E", "A"] as Rol[]).map((rl) => <span key={rl} className="tb-leg-item"><span className="gorra-dot" style={{ background: `var(${GORRA_COLOR[rl]})` }} />{ROLNAME[rl]}</span>)}
        <span className="tb-leg-sep" />
        <span className="tb-leg-t">Carga = suma del peso de sus gorras. Más chamba arriba.</span>
      </div>
      <div className="tb-scroll">
        <div className="tb-grid" style={{ gridTemplateColumns: cols }}>
          {/* Encabezado */}
          <div className="tb-h tb-sticky">Persona</div>
          {vivos.map((p) => <div key={p.id} className="tb-h tb-proj"><span className="tb-proj-n">{p.nombre}</span><span className="tb-proj-m">{p.members.length} pers.{(p.estado ?? "") === "cerrado" ? " · cerrado" : ""}</span></div>)}
          <div className="tb-h tb-carga-h">Carga</div>
          {/* Filas con chamba */}
          {conChamba.map((row) => (
            <div className="tb-rowc" key={row.key} style={{ display: "contents" }}>
              <div className="tb-person tb-sticky">
                <span className="tb-avatar" style={{ background: `color-mix(in srgb, var(${roleColor[row.quien]}) 18%, transparent)`, color: `var(${roleColor[row.quien]})` }}>{inicial(row.nombre)}</span>
                <span className="tb-pn"><b>{row.nombre}</b><span className={"badge " + badgeCls[row.quien]}>{badgeTxt[row.quien]}</span></span>
              </div>
              {vivos.map((p) => { const a = row.allocs[p.id]; return (
                <div key={p.id} className="tb-cell">
                  {a ? <span className={"gorra g-" + a.rol + (a.cerrado ? " cerr" : "")} style={{ background: `color-mix(in srgb, var(${GORRA_COLOR[a.rol]}) 15%, transparent)`, color: `var(${GORRA_COLOR[a.rol]})`, borderColor: `color-mix(in srgb, var(${GORRA_COLOR[a.rol]}) 35%, transparent)` }} title={`${GORRA_SHORT[a.rol]} · ${fmtMXN(a.monto)}`}>{ROLNAME[a.rol]}</span> : <span className="tb-empty">·</span>}
                </div>
              ); })}
              <div className="tb-carga">
                <div className={"tb-bar " + cargaClass(row.carga)}><i style={{ width: Math.max(6, row.carga / maxCarga * 100) + "%" }} /></div>
                <span className="tb-carga-n">{row.nproy} proy · {fmtMXN(row.monto)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {libres.length > 0 && (
        <div className="tb-libres">
          <span className="tb-libres-t">Disponibles · sin proyecto ahora</span>
          <div className="tb-libres-list">
            {libres.map((row) => <span key={row.key} className="tb-libre-chip"><span className="tb-avatar sm" style={{ background: `color-mix(in srgb, var(${roleColor[row.quien]}) 18%, transparent)`, color: `var(${roleColor[row.quien]})` }}>{inicial(row.nombre)}</span>{row.nombre}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Proyectos({ st, update, setActive, otroNombre, log }: { st: State; update: (fn: (s: State) => State) => void; setActive: (id: string) => void; otroNombre?: string; log?: (act: string, det: string) => void }) {
  const [open, setOpen] = useState<string | null>(st.activeId);
  const [vista, setVista] = useState<"pagos" | "equipo">("pagos");
  const visibles = st.projects.filter((p) => !p.borrador);   // los borradores viven solo en la Calculadora
  // Si ya hay un borrador en curso, contínualo (no lo perdemos); si no, crea uno en blanco.
  const nuevo = () => { const ex = st.projects.find((x) => x.borrador); if (ex) { setActive(ex.id); return; } const nb = makeDraft(st.projects); update((s) => { s.projects.push(nb); return s; }); setActive(nb.id); };
  return (
    <>
      <div className="page-h"><div><h1>Proyectos</h1><p>{vista === "pagos" ? "Registra cada pago que entra y te digo cuánto mandar a cada caja." : "Dónde está cada quien y quién trae más o menos carga."}</p></div>{vista === "pagos" && <button className="btn primary" onClick={nuevo}><Plus size={15} /> Nuevo</button>}</div>
      <div className="unit-bar" style={{ marginBottom: 16 }}>
        <span className="unit-cap">Ver</span>
        <div className="chips">
          <button className="chip-btn sm" aria-pressed={vista === "pagos"} onClick={() => setVista("pagos")}>Pagos</button>
          <button className="chip-btn sm" aria-pressed={vista === "equipo"} onClick={() => setVista("equipo")}>Equipo · tablero</button>
        </div>
      </div>
      {vista === "equipo" ? <TableroEquipo st={st} /> : (
      <div className="proj-list rise">
        {visibles.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p className="hint" style={{ marginTop: 0 }}>Aún no guardas ningún proyecto. Ve a la <b>Calculadora</b>, arma uno y dale <b>Guardar proyecto</b>.</p>
          </div>
        )}
        {visibles.map((p) => (
          <ProyectoCard key={p.id} p={p} params={st.params} roster={st.roster} gastos={st.gastos} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} update={update} setActive={setActive} otroNombre={otroNombre} log={log} />
        ))}
      </div>
      )}
    </>
  );
}

/* Progreso mes a mes de un proyecto a plazo: N celdas (mes 1…N con fecha real)
   que se van llenando conforme se cobra. "Vas en el mes X de N". Automático: los
   meses cubiertos = % recibido × N (no hay que marcar nada). El monto por celda es
   el cobro mensual (totalCliente ÷ N). Decisión Andrés 2026-07-19 (auto por lo cobrado). */
function MesesProgreso({ p, rec }: { p: Proyecto; rec: number }) {
  const N = Math.max(1, Math.floor(p.plazoMeses || 1));
  if (N < 2) return null;
  const inicio = p.fechaInicio || todayISO();
  const totCli = totalCliente(p);
  const mensual = totCli / N;
  const cubiertos = Math.max(0, rec * N);           // meses cubiertos (fraccional)
  const completo = cubiertos >= N - 0.001;
  const mesActual = completo ? N : Math.min(N, Math.floor(cubiertos) + 1);
  return (
    <div className="meses-prog">
      <div className="meses-h">
        <b>{completo ? `Cobrado completo · ${N} de ${N} meses` : `Vas en el mes ${mesActual} de ${N}`}</b>
        <span>{fmtMXN(rec * totCli)} de {fmtMXN(totCli)} · {fmtMXN(mensual)}/mes</span>
      </div>
      <div className="meses-strip">
        {Array.from({ length: N }, (_, i) => {
          const fill = Math.min(1, Math.max(0, cubiertos - i));
          const estado = fill >= 0.999 ? "full" : fill > 0.001 ? "part" : "none";
          return (
            <div key={i} className={"mes-cell " + estado} title={`${mesLabel(addMonths(inicio, i))}: ${estado === "full" ? "pagado" : estado === "part" ? "parcial" : "pendiente"}`}>
              <span className="mes-lbl">{mesLabel(addMonths(inicio, i))}</span>
              <span className="mes-bar"><i style={{ width: fill * 100 + "%" }} /></span>
              <span className="mes-amt">{fmtMXN(mensual)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProyectoCard({ p, params, roster, gastos, open, onToggle, update, setActive, otroNombre, log }: {
  p: Proyecto; params: Reglas; roster: RosterPerson[]; gastos: Gasto[]; open: boolean; onToggle: () => void;
  update: (fn: (s: State) => State) => void; setActive: (id: string) => void; otroNombre?: string; log?: (act: string, det: string) => void;
}) {
  const autoriza = otroNombre || params.nombreB; // quién debe dar el visto bueno (el OTRO socio)
  const [confirmDel, setConfirmDel] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [reglasOpen, setReglasOpen] = useState(false);
  const [gastosOpen, setGastosOpen] = useState(false);
  const [gConcepto, setGConcepto] = useState("");
  const [gMonto, setGMonto] = useState(0);
  const [gCat, setGCat] = useState<string>(CAT_GASTO[0]);
  const [gFecha, setGFecha] = useState(todayISO());
  const [exported, setExported] = useState<Set<string>>(new Set()); // PDFs ya generados en esta sesión
  const R = reglasDe(p, params);   // foto congelada si está guardado; params vivos si no
  const pr = membersResolved(p, roster, R);
  const r = compute(pr, R);
  const gentePdf = Object.values(r.people)
    .filter((a) => a.trabajo + a.extra + (a.comision || 0) > 0.5)
    .sort((a, b) => (b.trabajo + b.extra + (b.comision || 0)) - (a.trabajo + a.extra + (a.comision || 0)) || order[a.quien] - order[b.quien]);
  const abrirPdf = (persona?: string) => window.open("/pdf/" + p.id + (persona ? "?persona=" + encodeURIComponent(persona) : ""), "_blank");
  // Resumen de texto del reparto, listo para mandar por WhatsApp.
  const textoReparto = () => {
    const lineas = gentePdf.map((a) => `• ${a.nombre}: ${fmtMXN(a.trabajo + a.extra + (a.comision || 0))}`);
    return `*Reparto — ${p.nombre}*\nIngreso: ${fmtMXN(r.t)}${p.conIVA ? ` (con IVA: ${fmtMXN(totalCliente(p))})` : ""}\n\nLo que gana cada quien:\n${lineas.join("\n")}`;
  };
  const exportPersona = (persona: string) => { abrirPdf(persona); setExported((s) => new Set(s).add(persona)); };
  const pagos = p.pagos || [];
  const doDelete = () => update((s) => {
    s.projects = s.projects.filter((x) => x.id !== p.id);
    if (s.activeId === p.id) s.activeId = s.projects[0]?.id || "";
    return s;
  });
  const cobrado = pagos.reduce((a, x) => a + (+x.monto || 0), 0);
  const rec = pctRecibido(p);
  const plN = Math.max(1, Math.floor(p.plazoMeses || 1));
  const mesAct = rec >= 1 - 0.001 ? plN : Math.min(plN, Math.floor(rec * plN) + 1);
  const manualN = p.members.filter((m) => typeof m.montoManual === "number").length; // sueldos tocados a mano
  const estado: EstadoProyecto = estadoAuto(p);
  const upP = (fn: (x: Proyecto) => void) => update((s) => { const x = s.projects.find((y) => y.id === p.id); if (x) fn(x); return s; });
  // Gastos de este proyecto (salen de su caja).
  const misGastos = gastosDeProyecto(gastos, p.id);
  const cajaBudget = cajaMonto(p), gastado = sumaGastos(misGastos), cajaRestante = cajaBudget - gastado;
  const addGasto = () => {
    if (gMonto <= 0 || !gConcepto.trim()) return;
    update((s) => { s.gastos.push({ id: uid(), n: gConcepto.trim(), m: Math.round(gMonto), categoria: gCat, fecha: gFecha, proyectoId: p.id }); return s; });
    setGConcepto(""); setGMonto(0);
  };
  const delGasto = (id: string) => update((s) => { s.gastos = s.gastos.filter((g) => g.id !== id); return s; });

  return (
    <div className={"pcard" + (open ? " open" : "")}>
      <div className="pcard-head" onClick={onToggle}>
        <span className="pcard-chev">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        <div className="pcard-title">
          <div className="gn">{p.nombre} <span className={"est est-" + estado}>{ESTADO_LABEL[estado]}</span>{manualN > 0 && !p.manualOK && <span className="est est-manual" title={`Sueldos a mano · falta que ${autoriza} autorice`}>a mano</span>}</div>
          <div className="gt">{p.tipo} · {p.members.length} pers. · {p.conIVA ? "con IVA" : "sin IVA"}{(p.plazoMeses ?? 1) > 1 ? ` · ${p.plazoMeses} meses` : ""}{p.clienteNombre ? " · " + p.clienteNombre : ""}</div>
        </div>
        <div className="pcard-right">
          <div className="gv">{fmtMXN(r.t)}</div>
          <div className="gm">{plN > 1 ? `mes ${mesAct} de ${plN} · ${pctFmt(rec)}` : `${pctFmt(rec)} cobrado`}</div>
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
          {manualN > 0 && (
            p.manualOK
              ? <div className="manual-ok"><Check size={14} /> Sueldos ajustados a mano ({manualN}) · <b>autorizado por {autoriza}</b></div>
              : <div className="manual-warn">
                  <span><AlertTriangle size={15} /> Este proyecto tiene <b>{manualN} sueldo{manualN !== 1 ? "s" : ""} tocado{manualN !== 1 ? "s" : ""} a mano</b>. Requiere el visto bueno de {autoriza}.</span>
                  <button className="btn primary" onClick={() => { upP((x) => { x.manualOK = true; }); log?.("autorizó sueldos a mano", p.nombre); }}><Check size={14} /> {autoriza}: autorizar</button>
                </div>
          )}
          <div className="pcard-actions">
            <button className="btn ghost" onClick={() => setActive(p.id)}><Calculator size={14} /> Editar</button>
            <button className="btn ghost" onClick={() => setPdfOpen(true)}><FileText size={14} /> PDF de reparto</button>
            <button className="btn ghost" onClick={() => window.open("/pdf/banco?proyecto=" + p.id, "_blank")}><Wallet size={14} /> Datos para cobro</button>
            <button className="btn ghost" onClick={() => setReglasOpen(true)}><SlidersHorizontal size={14} /> Ver reglas</button>
            <button className="btn ghost" onClick={() => setGastosOpen(true)}><Receipt size={14} /> Gastos{misGastos.length ? ` (${misGastos.length})` : ""}</button>
            <button className="btn ghost" onClick={() => compartir(`Reparto · ${p.nombre}`, textoReparto())}><Share2 size={14} /> WhatsApp</button>
            {estado === "cancelado"
              ? <button className="btn ghost" title="Reactivar: el estado vuelve a calcularse solo según lo cobrado" onClick={() => upP((x) => { x.estado = undefined; })}><RotateCcw size={14} /> Reactivar</button>
              : <button className="btn ghost" title="Marca el proyecto como cancelado (sale de los totales)" onClick={() => upP((x) => { x.estado = "cancelado"; })}><Trash2 size={14} /> Cancelar</button>}
          </div>

          <MesesProgreso p={p} rec={rec} />

          <div className="pay-cols">
            <div>
              <h3 className="pay-h">Registrar un pago</h3>
              <PagoForm ticket={r.t} conIVA={!!p.conIVA} cobrado={cobrado}
                onAdd={(pago) => { upP((x) => { x.pagos = [...(x.pagos || []), pago]; }); log?.("registró un pago", `${fmtMXN(pago.monto)} en ${p.nombre}`); }} />
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
                    <button className="btn sm ghost" title="Compartir por WhatsApp" onClick={() => compartir(`${a.nombre} · ${p.nombre}`, `Hola ${a.nombre}, tu parte de *${p.nombre}*: ${fmtMXN(base + comis)}${comis > 0.5 ? ` (${fmtMXN(base)} + ${fmtMXN(comis)} comisión)` : ""}.`)}><Share2 size={13} /></button>
                    <button className={"btn sm " + (ya ? "ok-btn" : "primary")} onClick={() => exportPersona(a.nombre)}>{ya ? <><Check size={13} /> Bajado</> : <><FileText size={13} /> PDF</>}</button>
                  </div>
                );
              })}
            </div>
            <button className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => abrirPdf()}>Abrir todos juntos (solo para ti)</button>
          </div>
        </div>
      )}

      {reglasOpen && (() => {
        const filas: [string, string][] = [
          ["Sombrero de socio (α)", `${R.alpha}%`],
          ["Reparto socios", `${R.nombreA} ${R.split}% · ${R.nombreB} ${100 - R.split}%`],
          ["Caja de ahorro", `${R.ahorro}%`],
          ["Barrido a Banca (β)", `${R.beta}%`],
          ["ISR reservado", `${R.imp}%`],
          ["Bono del Núcleo", `${R.pool}%`],
          ["Comisión de origen", `${R.comisPct}% (tope ${fmtMXN(R.comisTope)})`],
          ["Pesos de rol", `Piloto ${R.pesoP} · Especialista ${R.pesoE} · Apoyo ${R.pesoA}`],
          ["Seniority de un nuevo", `×${R.smNuevo}`],
          ["Meta de la Banca", fmtMXN(R.metaBancaMonto)],
          ["Caja de ESTE proyecto", `${p.cajaPct}%`],
        ];
        const tramos = [
          `Hasta ${fmtMXN(R.umbral1)} → ${R.brkChico}%`,
          `${fmtMXN(R.umbral1)}–${fmtMXN(R.umbral2)} → ${R.brkMediano}%`,
          `${fmtMXN(R.umbral2)}–${fmtMXN(R.umbral3)} → ${R.brkGrande}%`,
          `Más de ${fmtMXN(R.umbral3)} → ${R.brkTope}%`,
        ];
        return (
          <div className="pdf-modal-bg" onClick={() => setReglasOpen(false)}>
            <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pdf-modal-h">
                <div><b>Reglas de {p.nombre}</b><div className="hint" style={{ margin: "2px 0 0" }}>{p.reglas ? "Parámetros congelados al guardar este proyecto. Solo lectura." : "Este proyecto aún usa las reglas actuales (sin foto congelada)."}</div></div>
                <button className="rmv" onClick={() => setReglasOpen(false)}>×</button>
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                {filas.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 5 }}>
                    <span style={{ opacity: 0.75 }}>{k}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 4 }}>
                  <div style={{ opacity: 0.75, marginBottom: 4 }}>% de equipo por tramos (marginal):</div>
                  <div style={{ display: "grid", gap: 3 }}>{tramos.map((t, i) => <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{t}</div>)}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {gastosOpen && (
        <div className="pdf-modal-bg" onClick={() => setGastosOpen(false)}>
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-h">
              <div><b>Gastos de {p.nombre}</b><div className="hint" style={{ margin: "2px 0 0" }}>Salen de la caja del proyecto ({p.cajaPct}% del ticket = {fmtMXN(cajaBudget)}).</div></div>
              <button className="rmv" onClick={() => setGastosOpen(false)}>×</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span>Gastado <b style={{ fontFamily: "var(--mono)" }}>{fmtMXN(gastado)}</b> de {fmtMXN(cajaBudget)}</span>
                <span>Restante <b style={{ fontFamily: "var(--mono)", color: cajaRestante < 0 ? "var(--c-caja)" : "var(--cobalt)" }}>{fmtMXN(cajaRestante)}</b></span>
              </div>
              <div className="pcard-prog"><i style={{ width: Math.min(100, cajaBudget > 0 ? gastado / cajaBudget * 100 : 0) + "%", background: cajaRestante < 0 ? "var(--c-caja)" : undefined }} /></div>
              {cajaRestante < 0 && <p className="hint" style={{ color: "var(--c-caja)", marginTop: 4 }}>Te pasaste del presupuesto de la caja por {fmtMXN(-cajaRestante)}.</p>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 1fr 1.1fr", gap: 6, marginBottom: 6 }}>
              <input type="text" placeholder="Concepto (ej. vuelo CDMX)" value={gConcepto} onChange={(e) => setGConcepto(e.target.value)} />
              <div className="money-in"><span>$</span><input type="number" min={0} value={gMonto || ""} onChange={(e) => setGMonto(+e.target.value || 0)} /></div>
              <select value={gCat} onChange={(e) => setGCat(e.target.value)}>{CAT_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <input type="date" value={gFecha} onChange={(e) => setGFecha(e.target.value)} />
            </div>
            <button className="btn primary" style={{ width: "100%", marginBottom: 10 }} disabled={gMonto <= 0 || !gConcepto.trim()} onClick={addGasto}><Plus size={14} /> Agregar gasto</button>
            {misGastos.length === 0 ? (
              <div className="hint">Sin gastos aún. Agrega los viáticos, comidas, transporte, etc. que salgan de la caja de este proyecto para ver cómo va bajando.</div>
            ) : (
              Object.entries(misGastos.reduce((acc, g) => { const k = mesDe(g.fecha) || "0000-00"; (acc[k] = acc[k] || []).push(g); return acc; }, {} as Record<string, Gasto[]>))
                .sort(([a], [b]) => (a < b ? 1 : -1))
                .map(([mes, gs]) => (
                  <div key={mes} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, textTransform: "uppercase", opacity: 0.6, borderBottom: "1px solid var(--border)", paddingBottom: 2, marginBottom: 4 }}>
                      <span>{mes === "0000-00" ? "Sin fecha" : mesLabel(mes)}</span><span style={{ fontFamily: "var(--mono)" }}>{fmtMXN(sumaGastos(gs))}</span>
                    </div>
                    {gs.map((g) => (
                      <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                        <span style={{ flex: 1 }}>{g.n} <span className="badge" style={{ opacity: 0.7, marginLeft: 4 }}>{g.categoria || "Otros"}</span></span>
                        <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{fmtMXN(g.m)}</span>
                        <button className="rmv" onClick={() => g.id && delGasto(g.id)}>×</button>
                      </div>
                    ))}
                  </div>
                ))
            )}
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
  const [copied, setCopied] = useState(false);
  const listaTexto = () => {
    const L: string[] = [`Transferencias · ${p.nombre} · pago ${fmtMXN(pago.monto)}`, "─────────────"];
    cajas.forEach((c) => {
      L.push(`${c.label}: ${fmtMXN(c.total)}`);
      if (c.caja === "masaSalarial") c.detalle.forEach((dt) => L.push(`   · ${dt.nombre}${dt.concepto !== "sueldo" ? " (" + dt.concepto + ")" : ""}: ${fmtMXN(dt.monto)}`));
    });
    return L.join("\n");
  };
  const copiar = () => {
    const txt = listaTexto();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
  };
  return (
    <div className={"pago" + (pago.desembolsado ? " done" : "")}>
      <div className="pago-head">
        <div>
          <b>{fmtMXN(pago.monto)}</b> <span className="hint" style={{ margin: 0 }}>· {pago.fecha}{pago.nota ? " · " + pago.nota : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="icon-btn" title="Recibo de cobro para el cliente" onClick={() => window.open("/pdf/recibo?tipo=cobro&proyecto=" + p.id + "&pago=" + pago.id, "_blank")}><FileText size={13} /></button>
          <button className="rmv" onClick={onDelete} title="Borrar pago">×</button>
        </div>
      </div>
      <div className="desemb">
        <div className="desemb-h"><span><Wallet size={13} /> Reparte este pago en tus cajas de Revolut:</span>
          <button className="btn ghost sm" onClick={copiar} title="Copia la lista exacta de transferencias para seguirla en Revolut">{copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar lista</>}</button>
        </div>
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

function Cajas({ st, update, setSec, log }: { st: State; update: (fn: (s: State) => State) => void; setSec: (s: string) => void; log?: (act: string, det: string) => void }) {
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

  const pagarPersona = (nombre: string, ids: string[]) => { update((s) => {
    ids.forEach((id) => { const p = s.projects.find((x) => x.id === id); if (p) p.equipoPagado = { ...(p.equipoPagado || {}), [nombre]: todayISO() }; });
    return s;
  }); log?.("transfirió al equipo", `a ${nombre}`); };
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
      {n > 0 && <button className="deuda-toggle" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? "ocultar" : "ver de qué proyectos"} ({n})</button>}
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
          <button className="icon-btn" title="Comprobante de pago (con tu firma)" onClick={() => window.open("/pdf/recibo?tipo=pago&persona=" + encodeURIComponent(x.nombre), "_blank")}><FileText size={12} /></button>
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
        return s;
      });
      setSaved(true);
      return;
    }
    const proj = dest.tipo === "proyecto" ? st.projects.find((p) => p.id === dest.proyectoId) : null;
    update((s) => {
      s.gastos.push({ id: uid(), n: `${data.proveedor} · ${data.concepto}`.slice(0, 60), m: Math.round(data.total), proveedor: data.proveedor, fecha: data.fecha, proyectoId: proj?.id || null, categoria: proj ? "Otros" : undefined });
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

/* Drawer flotante de Reglas para ajustar SIN salir de la Calculadora. Edita
   st.params (las Reglas vivas), así que los números de la Calculadora se mueven
   al instante. Arriba, un mini-preview de los sueldos del mes que reacciona en
   vivo mientras arrastras cada perilla. */
function ReglasDrawer({ st, update, onClose, setSec, preview }: {
  st: State; update: (fn: (s: State) => State) => void; onClose: () => void; setSec: (s: string) => void;
  preview: { l: string; v: string; c?: string }[];
}) {
  const P = st.params;
  const setN = (k: keyof Reglas, v: number) => update((s) => { (s.params[k] as number) = v; return s; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const knob = (k: keyof Reglas, label: string, min: number, max: number, step = 1) => (
    <div className="rd-knob">
      <div className="rd-knob-h"><span>{label}</span><span className="rd-knob-v">{P[k] as number}%</span></div>
      <input type="range" min={min} max={max} step={step} value={P[k] as number} onChange={(e) => setN(k, +e.target.value)} />
    </div>
  );
  return (
    <div className="rd-wrap" role="dialog" aria-label="Ajustar reglas">
      <div className="rd-catch" onClick={onClose} />
      <aside className="rd-panel">
        <div className="rd-head">
          <div><b>Ajustar reglas</b><span>los números se mueven en vivo</span></div>
          <button className="rd-x" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="rd-preview">
          {preview.map((p) => <div key={p.l} className="rd-pv"><span className="rd-pv-l">{p.l}</span><b style={p.c ? { color: `var(${p.c})` } : undefined}><span key={p.v} className="num-anim">{p.v}</span></b></div>)}
        </div>
        <div className="rd-body">
          {knob("alpha", "Cuánto cobra un socio de su trabajo", 0, 100, 5)}
          {knob("split", `Reparto ${P.nombreA} (resto ${P.nombreB})`, 50, 80)}
          {knob("ahorro", "Caja de ahorro (% del margen op.)", 0, 25)}
          {knob("beta", "Barrido de utilidad a Banca (β)", 0, 50, 5)}
          {knob("pool", "Bono del Núcleo (% utilidad)", 0, 30)}
          {knob("imp", "Tasa de ISR", 0, 20, 0.5)}
          {knob("comisPct", "Comisión de origen (% del margen)", 0, 30)}
        </div>
        <div className="rd-foot">
          <button className="btn ghost" onClick={() => { onClose(); setSec("reglas"); }}><SlidersHorizontal size={14} /> Abrir Reglas completas</button>
        </div>
      </aside>
    </div>
  );
}

/* Simulación: los sueldos del MES de todos, juntando los proyectos vivos + el que
   se está calculando (aunque sea borrador). Sirve para ver si alguien ya gana mucho
   sumando todo y decidir si se le ajusta. Reusa repartoPorMes por mes-calendario. */
function SimulacionDrawer({ st, active, onClose }: { st: State; active: Proyecto; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const vivos = st.projects.filter((p) => !p.borrador && (p.estado ?? "cotizacion") !== "cancelado" && p.id !== active.id);
  const universo = [...vivos, active]; // TODO lo vivo + este (aunque sea borrador)
  type SRow = { nombre: string; quien: Quien; byMonth: Record<string, number>; esteMonth: Record<string, number> };
  const agg: Record<string, SRow> = {};
  const monthsSet = new Set<string>();
  universo.forEach((p) => {
    const R = reglasDe(p, st.params);
    const rm = repartoPorMes(membersResolved(p, st.roster, R), R);
    const inicio = p.fechaInicio || todayISO();
    rm.forEach((mm) => {
      const ym = addMonths(inicio, mm.mes - 1);
      monthsSet.add(ym);
      Object.values(mm.personas).forEach((pe) => {
        const v = pe.trabajo + pe.extra + pe.comision;
        if (v <= 0.5) return;
        const k = pe.nombre + "|" + pe.quien;
        const rw = (agg[k] = agg[k] || { nombre: pe.nombre, quien: pe.quien, byMonth: {}, esteMonth: {} });
        rw.byMonth[ym] = (rw.byMonth[ym] || 0) + v;
        if (p.id === active.id) rw.esteMonth[ym] = (rw.esteMonth[ym] || 0) + v;
      });
    });
  });
  const months = [...monthsSet].sort();
  const curYM = todayISO().slice(0, 7);
  const startYM = (active.fechaInicio || todayISO()).slice(0, 7);
  const [selYM, setSelYM] = useState(months.includes(startYM) ? startYM : months.includes(curYM) ? curYM : months[0] || curYM);
  const rows = Object.values(agg)
    .map((rw) => ({ nombre: rw.nombre, quien: rw.quien, total: rw.byMonth[selYM] || 0, este: rw.esteMonth[selYM] || 0 }))
    .filter((r) => r.total > 0.5)
    .sort((a, b) => b.total - a.total || order[a.quien] - order[b.quien]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="rd-wrap" role="dialog" aria-label="Simulación de sueldos del mes">
      <div className="rd-catch" onClick={onClose} />
      <aside className="rd-panel sim-panel">
        <div className="rd-head">
          <div><b>Sueldos del mes · con todo</b><span>este proyecto sumado a los demás vivos</span></div>
          <button className="rd-x" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {months.length > 1 && (
          <div className="sim-months chips scroll">
            {months.map((m) => <button key={m} className="chip-btn sm" aria-pressed={m === selYM} onClick={() => setSelYM(m)}>{mesLabel(m)}</button>)}
          </div>
        )}
        <div className="rd-body">
          {rows.length === 0 ? <div className="hint">Nadie cobra en {mesLabel(selYM)} todavía.</div> : rows.map((r) => (
            <div key={r.nombre + r.quien} className="sim-row">
              <div className="sim-top"><span className="nm">{r.nombre}</span><span className={"badge " + badgeCls[r.quien]}>{badgeTxt[r.quien]}</span><span className="sim-amt">{fmtMXN(r.total)}<span className="sim-amt-lbl">/mes</span></span></div>
              <div className="track"><i style={{ width: Math.max(3, (r.total - r.este) / max * 100) + "%", background: `var(${roleColor[r.quien]})` }} />{r.este > 0.5 && <i className="seg-comis" style={{ width: Math.max(3, r.este / max * 100) + "%", background: "var(--cobalt)" }} />}</div>
              {r.este > 0.5 && <div className="sim-sub">de este proyecto <b>{fmtMXN(r.este)}</b> · ya tenía {fmtMXN(r.total - r.este)}</div>}
            </div>
          ))}
        </div>
        <div className="rd-foot"><p className="hint" style={{ margin: 0 }}>La franja azul es lo que <b>este</b> proyecto le suma a cada quien en {mesLabel(selYM)}. Si alguien ya gana mucho, ajústalo con <b>“Ajustar reglas”</b> o bajando su rol.</p></div>
      </aside>
    </div>
  );
}

function ReglasView({ st, update }: { st: State; update: (fn: (s: State) => State) => void }) {
  const P = st.params;
  const [confirmReset, setConfirmReset] = useState(false);
  const [ticketEj, setTicketEj] = useState(100000); // ticket de ejemplo para explicar los tramos
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
          {pct("imp", "Tasa de ISR (% que reservas)", 0, 20, 0.5)}
          <p className="hint" style={{ marginTop: -2 }}>La tasa que se aparta para el SAT, calculada sobre tu <b>facturación</b> (la base, sin IVA) — así lo grava RESICO. Se prende <b>proyecto por proyecto</b> con el botón “Descontar ISR” de la Calculadora (si no lo picas, ese proyecto no descuenta). Sale del <b>neto de socios</b> y no mueve el reparto. En <b>RESICO</b> Persona Física va por tramos ~1.0–2.5%; arranca en <b>1.5%</b>. <b>Confírmalo con tu contadora.</b></p>
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
        {(() => {
          const tramos = baseBolsaDesglose(ticketEj, P);
          const bolsaEj = tramos.reduce((a, x) => a + x.aporte, 0);
          const nombres = ["chico", "mediano", "grande", "muy grande"];
          return (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div className="field" style={{ ...rowStyle, marginBottom: 8 }}>
                <label style={{ margin: 0, flex: 1 }}>Pruébalo con un ticket de ejemplo</label>
                <div className="money-in" style={{ flex: 1.3 }}><span>$</span><input type="number" min={0} step={5000} value={ticketEj} onChange={(e) => setTicketEj(Math.max(0, +e.target.value || 0))} /></div>
              </div>
              <div className="stack">
                {tramos.filter((x) => x.aporte > 0.5).map((x) => (
                  <div key={x.i} className="seg" title={`Tramo ${nombres[x.i]} · ${x.pct}% · ${fmtMXN(x.aporte)}`} style={{ flex: `0 0 ${x.aporte / (bolsaEj || 1) * 100}%`, background: x.activo ? "var(--c-equipo)" : "var(--border)" }} />
                ))}
              </div>
              <div style={{ fontSize: 13, marginTop: 8, display: "grid", gap: 3 }}>
                {tramos.map((x) => (
                  <div key={x.i} style={{ display: "flex", justifyContent: "space-between", opacity: x.activo ? 1 : 0.4 }}>
                    <span>{x.activo ? "✓" : "—"} Tramo {nombres[x.i]} ({x.pct}%){x.hasta === Infinity ? ` · > ${fmtMXN(x.desde)}` : ` · ${fmtMXN(x.desde)}–${fmtMXN(x.hasta)}`}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{x.activo ? fmtMXN(x.aporte) : "no aplica"}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
                  <span>Bolsa del equipo para {fmtMXN(ticketEj)}</span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--cobalt)" }}>{fmtMXN(bolsaEj)} · {pctFmt(bolsaEj / (ticketEj || 1))}</span>
                </div>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>Estás moviendo <b>tramos</b>, no el ticket. Para un ticket de {fmtMXN(ticketEj)} solo aplican los tramos marcados ✓ (hasta donde llega el ticket). Mover un tramo que dice “no aplica” <b>no cambia nada</b> para este ticket — por eso a veces parece que una barrita no hace nada.</p>
            </div>
          );
        })()}
      </div>

      <div className="card"><h2>Caja del proyecto — % por defecto según el tipo</h2>
        <p className="hint" style={{ marginTop: 0 }}>El % del ingreso que se aparta para gastos del proyecto (viáticos, comidas, etc.). Esto es el <b>default</b> al elegir el tipo; en cada proyecto puedes ajustarlo con su slider en la Calculadora.</p>
        <div className="two" style={{ marginTop: 4 }}>
          <div>
            {pct("cajaTrazo", "Trazo", 0, 25)}
            {pct("cajaTrayectoria", "Trayectoria", 0, 25)}
          </div>
          <div>
            {pct("cajaAlianza", "Alianza", 0, 25)}
          </div>
        </div>
      </div>

      <div className="two">
        <div className="card"><h2>Banca y seniority</h2>
          {mult("smNuevo", "Seniority de un integrante nuevo")}
          {money("metaBancaMonto", "Meta de la Banca (colchón)")}
          {money("metaFacturacion", "Meta de facturación del mes (venta)")}
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

      <div className="card">
        <h2>Bono del Núcleo</h2>
        {pct("pool", "Bono del Núcleo — % de la utilidad de socios para el Núcleo", 0, 25)}
        <p className="foot">Un extra para tu gente de planta (Núcleo) <b>además</b> de su pago por trabajo. Sale de tu utilidad y la de {P.nombreB}, y se reparte en partes iguales entre el Núcleo. {P.pool > 0 ? <>Prendido al <b>{P.pool}%</b>.</> : "Hoy apagado."} Aplica a proyectos <b>nuevos</b>; los ya guardados conservan su reparto congelado.</p>
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
  return <div className={"tile " + k}><div className="tl"><i />{l}{tip && <span className="tip" data-tip={tip} style={{ marginLeft: "auto" }}><Info /></span>}</div><div className="tv"><span key={v} className="num-anim">{v}</span></div>{p && <div className="tp">{p}</div>}</div>;
}
function Rank({ rows }: { rows: { nombre: string; quien: Quien; trabajo: number; extra: number; comision?: number }[] }) {
  const totOf = (a: { trabajo: number; extra: number; comision?: number }) => a.trabajo + a.extra + (a.comision || 0);
  const max = Math.max(1, ...rows.map(totOf));
  if (!rows.length) return <div className="hint">Sin datos.</div>;
  return <div className="rank">{rows.map((a, i) => { const base = a.trabajo + a.extra; const comis = a.comision || 0; const tot = base + comis; return (
    <div key={i} className="rk"><div className="who">{comis > 0.5 && <span className="comis-dot" title={`Incluye ${fmtMXN(comis)} de comisión por traer el proyecto`} />}<span className="nm">{a.nombre}</span><span className={"badge " + badgeCls[a.quien]}>{badgeTxt[a.quien]}</span></div>
      <div className="track">{base > 0.5 && <i style={{ width: Math.max(3, base / max * 100) + "%", background: `var(${roleColor[a.quien]})` }} />}{comis > 0.5 && <i className="seg-comis" title={`Comisión: ${fmtMXN(comis)}`} style={{ width: Math.max(3, comis / max * 100) + "%", background: "var(--c-caja)" }} />}</div>
      <div className="amt"><span key={fmtMXN(tot)} className="num-anim">{fmtMXN(tot)}</span>{comis > 0.5 && <span className="amt-comis">{fmtMXN(base)} + {fmtMXN(comis)}</span>}</div></div>); })}</div>;
}
function Field({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 3 }}>{l}</div><div style={{ fontWeight: strong ? 700 : 500, fontFamily: strong ? "var(--mono)" : "var(--sans)", color: strong ? "var(--pos)" : "var(--ink)" }}>{v}</div></div>;
}
