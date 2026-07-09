"use client";
import { useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import {
  LayoutDashboard, Calculator, FolderKanban, Receipt, SlidersHorizontal, UploadCloud, Check,
} from "lucide-react";
import {
  compute, fmtMXN, pctFmt, metaBanca, REGLAS_DEFAULT, type Proyecto, type Reglas, type Miembro, type Quien,
} from "@/lib/reparto";

type Gasto = { n: string; m: number; proyectoId?: string | null; proveedor?: string; fecha?: string | null };
type Cliente = { id: string; nombre: string; estado: string | null };
type State = { params: Reglas; gastos: Gasto[]; projects: Proyecto[]; activeId: string; rulesVersion?: number };
const RULES_VERSION = 3; // sube esto cuando una decisión deba re-aplicarse a estados guardados

const KEY = "curva_socios_v1";
const uid = () => "p" + Math.random().toString(36).slice(2, 9);
const roleColor: Record<Quien, string> = { socioA: "--c-andres", socioB: "--c-balmo", nucleo: "--c-banca", nuevo: "--muted" };
const badgeCls: Record<Quien, string> = { socioA: "b-socio", socioB: "b-socio", nucleo: "b-nucleo", nuevo: "b-nuevo" };
const badgeTxt: Record<Quien, string> = { socioA: "socio", socioB: "socio", nucleo: "núcleo", nuevo: "nuevo" };
const order: Record<Quien, number> = { socioA: 0, socioB: 1, nucleo: 2, nuevo: 3 };
const cajaPreset = { trazo: 10, trayectoria: 8, alianza: 15 } as const;
const DEF_GASTOS: Gasto[] = [
  { n: "ChatGPT", m: 360 }, { n: "Claude Max", m: 1800 }, { n: "Claude", m: 360 }, { n: "Notion", m: 400 }, { n: "Contadora", m: 800 },
];

function newProject(name: string): Proyecto {
  return {
    id: uid(), nombre: name, ticket: 80000, tipo: "trazo", cajaPct: 10, comisOn: true, comisWho: "banca", origen: "empresa", inMonth: true,
    members: [{ rol: "P", quien: "socioA", nombre: "Andrés", sm: 1 }, { rol: "E", quien: "nucleo", nombre: "Ivana", sm: 1 }],
  };
}
function initialState(): State {
  const p1 = newProject("Wellness (ejemplo)");
  const p2 = newProject("Web Trazo (ejemplo)");
  p2.ticket = 30000; p2.cajaPct = 8; p2.members = [{ rol: "P", quien: "nucleo", nombre: "Lomba", sm: 1 }];
  return { params: { ...REGLAS_DEFAULT }, gastos: DEF_GASTOS.slice(), projects: [p1, p2], activeId: p1.id, rulesVersion: RULES_VERSION };
}

const NAV = [
  { k: "panel", label: "Panel", Icon: LayoutDashboard },
  { k: "calculadora", label: "Calculadora", Icon: Calculator },
  { k: "proyectos", label: "Proyectos", Icon: FolderKanban },
  { k: "facturas", label: "Facturas", Icon: Receipt },
  { k: "reglas", label: "Reglas", Icon: SlidersHorizontal },
] as const;

export default function App() {
  const [st, setSt] = useState<State | null>(null);
  const [sec, setSec] = useState<string>("panel");
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    let s: State | null = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* noop */ }
    // Merge de parámetros: los guardados mandan, pero cualquier perilla NUEVA
    // (que antes estaba hardcodeada) toma su default. Así no rompemos localStorage viejo.
    if (s && s.projects) {
      const merged: State = { ...s, params: { ...REGLAS_DEFAULT, ...(s.params || {}) } };
      // Migraciones de decisiones (se re-aplican a estados guardados viejos):
      if ((s.rulesVersion || 0) < 2) { merged.params.pool = 0; }              // apagar bono del Núcleo
      if ((s.rulesVersion || 0) < 3) { merged.params.metaBancaMonto = 48000; } // meta de Banca realista
      merged.rulesVersion = RULES_VERSION;
      setSt(merged);
    } else {
      setSt(initialState());
    }
  }, []);
  useEffect(() => { if (st) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* noop */ } }, [st]);
  useEffect(() => {
    fetch("/api/clientes").then((r) => r.json()).then((d) => { if (d.ok) setClientes(d.clientes || []); }).catch(() => {});
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
        {sec === "panel" && <Panel st={st} overhead={overhead} />}
        {sec === "calculadora" && <Calculadora st={st} active={active} clientes={clientes} update={update} updateActive={updateActive} setSec={setSec} />}
        {sec === "proyectos" && <Proyectos st={st} update={update} setActive={(id) => { update((s) => { s.activeId = id; return s; }); setSec("calculadora"); }} />}
        {sec === "facturas" && <Facturas st={st} clientes={clientes} update={update} />}
        {sec === "reglas" && <ReglasView st={st} update={update} />}
      </main>
    </div>
  );
}

/* ---------------- Panel ---------------- */
function Panel({ st, overhead }: { st: State; overhead: number }) {
  const inm = st.projects.filter((p) => p.inMonth);
  let fact = 0, banca = 0, utilKept = 0;
  const ppl: Record<string, { nombre: string; quien: Quien; trabajo: number; extra: number }> = {};
  inm.forEach((p) => {
    const r = compute(p, st.params); fact += r.t; banca += r.banca; utilKept += r.sAutil + r.sButil;
    Object.values(r.people).forEach((a) => { const k = a.nombre + "|" + a.quien; if (!ppl[k]) ppl[k] = { nombre: a.nombre, quien: a.quien, trabajo: 0, extra: 0 }; ppl[k].trabajo += a.trabajo; ppl[k].extra += a.extra; });
  });
  const preTax = Math.max(0, utilKept - overhead), neto = preTax * (1 - st.params.imp / 100);
  const meta = metaBanca(st.params);
  const rows = Object.values(ppl).filter((a) => a.trabajo + a.extra > 0.5).sort((a, b) => (b.trabajo + b.extra) - (a.trabajo + a.extra) || order[a.quien] - order[b.quien]);
  const alerts: [string, string][] = [];
  if (banca < meta * 0.34) alerts.push(["warn", `La Banca del mes (${fmtMXN(banca)}) va corta para la meta del colchón (${fmtMXN(meta)}). Toma sombreros o sube la caja de ahorro.`]);
  else if (banca < meta) alerts.push(["info", `La Banca va en ${Math.round(banca / (meta || 1) * 100)}% de la meta (${fmtMXN(meta)}). Vas bien.`]);
  else alerts.push(["ok", "La Banca ya cubre la meta del colchón. Sano."]);
  inm.forEach((p) => { const r = compute(p, st.params); const mr = r.marginOp / (r.t || 1); if (mr < 0.25) alerts.push(["warn", `${p.nombre}: margen bajo (${pctFmt(mr)}). Sube precio o baja gente.`]); });

  return (
    <>
      <div className="page-h"><div><h1>Panel</h1><p>El estado de CURVA este mes, de un vistazo.</p></div></div>
      <div className="tiles">
        <Tile k="k-fact" l="Facturado del mes" v={fmtMXN(fact)} p={`${inm.length} proyecto${inm.length !== 1 ? "s" : ""}`} />
        <Tile k="k-a" l="Utilidad bruta socios" v={fmtMXN(utilKept)} p="antes de gastos" />
        <Tile k="k-banca" l="A la Banca" v={fmtMXN(banca)} p="ahorro del mes" />
        <Tile k="k-neto" l="Utilidad NETA socios" v={fmtMXN(neto)} p="después de gastos e imp." />
      </div>
      <div className="two">
        <div className="card">
          <h2>Banca — colchón de CURVA</h2>
          <div className="prog"><i style={{ width: Math.min(100, banca / (meta || 1) * 100) + "%" }} /></div>
          <div className="prog-lbl"><span>Generado este mes: <b>{fmtMXN(banca)}</b></span><span>Meta del colchón: <b>{fmtMXN(meta)}</b></span></div>
          <p className="foot">La Banca la alimentan el descuento del sombrero de socio y la caja de ahorro. Es el colchón de emergencia de CURVA y el trampolín para pasar a alguien a nómina. Meta: <b>{fmtMXN(meta)}</b>.</p>
        </div>
        <div className="card"><h2>Alertas</h2>{alerts.map((a, i) => <div key={i} className={"alert " + a[0]}>{a[1]}</div>)}</div>
      </div>
      <div className="two">
        <div className="card"><h2>Proyectos del mes</h2>{inm.length ? inm.map((p) => { const r = compute(p, st.params); return (<div key={p.id} className="grow"><div><div className="gn">{p.nombre}</div><div className="gt">{p.tipo} · {p.members.length} pers.</div></div><div className="gv">{fmtMXN(r.t)}</div><div className="gm">margen {pctFmt(r.marginOp / (r.t || 1))}</div></div>); }) : <div className="hint">Ningún proyecto en el mes.</div>}</div>
        <div className="card"><h2>Cuánto se lleva cada quien</h2><Rank rows={rows} /></div>
      </div>
    </>
  );
}

/* ---------------- Calculadora ---------------- */
function Calculadora({ st, active, clientes, update, updateActive, setSec }: {
  st: State; active: Proyecto; clientes: Cliente[];
  update: (fn: (s: State) => State) => void; updateActive: (fn: (p: Proyecto) => void) => void; setSec: (s: string) => void;
}) {
  const P = st.params, r = compute(active, P), t = r.t || 1;
  const equipoTot = r.bolsaOut + r.comisPaid;
  const segs = [
    { k: "Equipo", v: equipoTot, c: "--c-equipo" }, { k: "Caja proyecto", v: Math.max(0, r.cajaProj), c: "--c-caja" },
    { k: "Banca", v: r.banca, c: "--c-banca" }, { k: P.nombreA, v: r.sAutil, c: "--c-andres" }, { k: P.nombreB, v: r.sButil, c: "--c-balmo" },
  ].filter((s) => s.v > 0.5);
  const totSeg = segs.reduce((s, x) => s + x.v, 0) || 1;
  const rows = Object.values(r.people).filter((x) => x.trabajo + x.extra > 0.5).sort((a, b) => (b.trabajo + b.extra) - (a.trabajo + a.extra) || order[a.quien] - order[b.quien]);
  let tT = 0, tE = 0; Object.values(r.people).forEach((a) => { tT += a.trabajo; tE += a.extra; });
  // comisPaid ya está dentro de tE (se asignó a quien la trajo), no se suma aparte.
  const leak = r.t - (tT + tE + r.cajaProj + r.banca);
  const mr = r.marginOp / t;
  const bd = (cls: string, l: string, v: number) => <div className={"bd-row " + cls}><span className="bl">{l}</span><span className="bv">{fmtMXN(v)}</span></div>;

  return (
    <>
      <div className="page-h"><div><h1>Calculadora</h1><p>Mete el proyecto y ve, peso por peso, cuánto le toca a cada quien.</p></div></div>
      <div className="proj-bar">
        <select value={active.id} onChange={(e) => update((s) => { s.activeId = e.target.value; return s; })}>
          {st.projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.inMonth ? "" : " · fuera del mes"}</option>)}
        </select>
        <input type="text" value={active.nombre} style={{ maxWidth: 190 }} onChange={(e) => updateActive((p) => { p.nombre = e.target.value; })} />
        <button className="btn primary" onClick={() => update((s) => { const np = newProject("Proyecto " + (s.projects.length + 1)); s.projects.push(np); s.activeId = np.id; return s; })}>Nuevo</button>
        <button className="btn danger" onClick={() => update((s) => { if (s.projects.length <= 1) return s; s.projects = s.projects.filter((x) => x.id !== s.activeId); s.activeId = s.projects[0].id; return s; })}>Borrar</button>
        <label className="hint" style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", marginTop: 0 }}>
          <input type="checkbox" checked={active.inMonth} onChange={(e) => updateActive((p) => { p.inMonth = e.target.checked; })} /> Contar en el mes
        </label>
      </div>

      <div className="grid">
        <div className="sidec">
          <div className="card">
            <h2>El proyecto</h2>
            <div className="field"><label>Valor del proyecto (sin IVA)</label><div className="money-in"><span>$</span><input type="number" value={active.ticket} onChange={(e) => updateActive((p) => { p.ticket = +e.target.value || 0; })} /></div>
              <p className="hint" style={{ marginTop: 6 }}>De este proyecto, al equipo le toca <b style={{ color: "var(--cobalt)" }}>{pctFmt(r.bolsaOut / (r.t || 1))}</b> = {fmtMXN(r.bolsaOut)}. En proyectos más grandes el % baja (CURVA se queda con más). <b>Vender más caro SIEMPRE deja más</b> — sin trampas.</p>
            </div>
            <div className="field"><label>Tipo</label><div className="chips">{(["trazo", "trayectoria", "alianza"] as const).map((tp) => <button key={tp} className="chip-btn" aria-pressed={active.tipo === tp} onClick={() => updateActive((p) => { p.tipo = tp; p.cajaPct = cajaPreset[tp]; })}>{tp[0].toUpperCase() + tp.slice(1)}</button>)}</div></div>
            <div className="field"><label>¿Quién trajo este cliente?</label>
              <div className="chips">
                <button className="chip-btn" aria-pressed={(active.origen || "empresa") === "empresa"} onClick={() => updateActive((p) => { p.origen = "empresa"; })}>La empresa / inbound</button>
                <button className="chip-btn" aria-pressed={active.origen === "socio"} onClick={() => updateActive((p) => { p.origen = "socio"; })}>Un socio</button>
                <button className="chip-btn" aria-pressed={active.origen === "persona"} onClick={() => updateActive((p) => { p.origen = "persona"; })}>Equipo / externo</button>
              </div>
              {active.origen === "persona" && (
                <input type="text" style={{ marginTop: 8 }} placeholder="¿Quién? (nombre)" value={active.origenPersona || ""} onChange={(e) => updateActive((p) => { p.origenPersona = e.target.value; })} />
              )}
              <p className="hint" style={{ marginTop: 6 }}>
                {(active.origen || "empresa") === "empresa" ? "La marca es de los dos → sin comisión."
                  : active.origen === "socio" ? "🛡️ Los socios NO cobran comisión a su bolsillo (diluiría al otro). Va a la Banca."
                  : "Cobra la comisión quien lo trajo (no diluye a ningún socio)."}
              </p>
            </div>
            <div className="field"><label>Caja del proyecto <span style={{ color: "var(--cobalt)", fontFamily: "var(--mono)", fontWeight: 700 }}>{active.cajaPct}%</span></label><input type="range" min={0} max={25} value={active.cajaPct} onChange={(e) => updateActive((p) => { p.cajaPct = +e.target.value; })} /></div>
            <div className="field"><label>Cliente (de Notion)</label><select value={active.clienteId || ""} onChange={(e) => updateActive((p) => { p.clienteId = e.target.value || null; p.clienteNombre = clientes.find((c) => c.id === e.target.value)?.nombre || null; })}><option value="">— sin asignar —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          </div>
          <div className="card">
            <h2>El equipo del proyecto</h2>
            {active.members.map((m, i) => (
              <div className="member" key={i}>
                <input type="text" value={m.nombre} onChange={(e) => updateActive((p) => { p.members[i].nombre = e.target.value; })} />
                <select value={m.rol} onChange={(e) => updateActive((p) => { p.members[i].rol = e.target.value as Miembro["rol"]; })}><option value="P">Piloto</option><option value="E">Especialista</option><option value="A">Apoyo</option></select>
                <select value={m.quien} onChange={(e) => updateActive((p) => { const q = e.target.value as Quien; p.members[i].quien = q; p.members[i].sm = q === "nuevo" ? P.smNuevo : 1; })}><option value="socioA">{P.nombreA}</option><option value="socioB">{P.nombreB}</option><option value="nucleo">Núcleo</option><option value="nuevo">Nuevo</option></select>
                <button className="rmv" onClick={() => updateActive((p) => { p.members.splice(i, 1); })}>×</button>
              </div>
            ))}
            <button className="add" onClick={() => updateActive((p) => { p.members.push({ rol: "A", quien: "nuevo", nombre: "Nuevo", sm: P.smNuevo }); })}>+ Agregar persona</button>
          </div>
        </div>

        <div>
          <div className="tiles">
            <Tile k="k-curva" l="CURVA se queda" v={fmtMXN(r.marginOp)} p={`${pctFmt(r.marginOp / t)} del ingreso`} />
            <Tile k="k-a" l={r.sAseat > 0 ? `${P.nombreA} · trabaja` : P.nombreA} v={fmtMXN(r.socioA)} p={r.sAseat > 0 ? `sombrero ${fmtMXN(r.sAseat)}` : `socio ${P.split}%`} />
            <Tile k="k-b" l={r.sBseat > 0 ? `${P.nombreB} · trabaja` : P.nombreB} v={fmtMXN(r.socioB)} p={r.sBseat > 0 ? `sombrero ${fmtMXN(r.sBseat)}` : `socio ${100 - P.split}%`} />
            <Tile k="k-banca" l="A la Banca" v={fmtMXN(r.banca)} p="ahorro CURVA" />
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
    </>
  );
}

/* ---------------- Proyectos ---------------- */
function Proyectos({ st, update, setActive }: { st: State; update: (fn: (s: State) => State) => void; setActive: (id: string) => void }) {
  return (
    <>
      <div className="page-h"><div><h1>Proyectos</h1><p>Todo lo que estás cotizando y entregando.</p></div><button className="btn primary" onClick={() => update((s) => { const np = newProject("Proyecto " + (s.projects.length + 1)); s.projects.push(np); s.activeId = np.id; return s; })}>+ Nuevo</button></div>
      <div className="card">{st.projects.map((p) => { const r = compute(p, st.params); return (
        <div key={p.id} className="grow">
          <div><div className="gn">{p.nombre}</div><div className="gt">{p.tipo} · {p.members.length} pers. · margen {pctFmt(r.marginOp / (r.t || 1))}{p.clienteNombre ? " · " + p.clienteNombre : ""}</div></div>
          <label className="hint" style={{ marginTop: 0, display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={p.inMonth} onChange={(e) => update((s) => { const x = s.projects.find((y) => y.id === p.id); if (x) x.inMonth = e.target.checked; return s; })} /> mes</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div className="gv">{fmtMXN(r.t)}</div><button className="btn ghost" onClick={() => setActive(p.id)}>Abrir</button></div>
        </div>); })}</div>
    </>
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
  const [dest, setDest] = useState<{ tipo: "overhead" | "proyecto"; proyectoId: string }>({ tipo: "overhead", proyectoId: "" });
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
    const proj = dest.tipo === "proyecto" ? st.projects.find((p) => p.id === dest.proyectoId) : null;
    update((s) => {
      s.gastos.push({ n: `${data.proveedor} · ${data.concepto}`.slice(0, 60), m: Math.round(data.total), proveedor: data.proveedor, fecha: data.fecha, proyectoId: proj?.id || null });
      return s;
    });
    setSaved(true);
  };

  return (
    <>
      <div className="page-h"><div><h1>Facturas</h1><p>Sube el XML (CFDI) de la factura, lo leo gratis y exacto, y lo asignas a un proyecto o al overhead.</p></div></div>
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
              <div className="field"><label>¿A dónde va este gasto?</label>
                <div className="chips">
                  <button className="chip-btn" aria-pressed={dest.tipo === "overhead"} onClick={() => setDest((d) => ({ ...d, tipo: "overhead" }))}>Overhead de CURVA</button>
                  <button className="chip-btn" aria-pressed={dest.tipo === "proyecto"} onClick={() => setDest((d) => ({ ...d, tipo: "proyecto" }))}>Caja de un proyecto</button>
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
  const setN = (k: keyof Reglas, v: number) => update((s) => { (s.params[k] as number) = v; return s; });
  const setS = (k: keyof Reglas, v: string) => update((s) => { (s.params[k] as string) = v; return s; });

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
          {pct("imp", "Impuesto aprox (% de la utilidad)", 0, 45)}
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

      <div className="card" style={{ borderStyle: "dashed", opacity: 0.95 }}>
        <h2>A futuro — aún no activo</h2>
        <p className="hint" style={{ marginTop: 0 }}>Cosas que el modelo puede hacer, pero que <b>hoy dejamos apagadas</b> para salir e ir iterando sin prometer de más. Préndelas cuando estén seguros.</p>
        {pct("pool", "Bono del Núcleo — % de la ganancia repartido al equipo de planta", 0, 25)}
        <p className="foot">Es un extra para la gente de planta (Ivana, Lomba, Yannick, Diana) además de su pago por trabajo. Se prende cuando tengan un Núcleo fijo y la Banca lo aguante. Hoy en <b>0%</b> = no reparte bono.</p>
      </div>
    </>
  );
}

/* ---------------- helpers UI ---------------- */
function Tile({ k, l, v, p }: { k: string; l: string; v: string; p?: string }) {
  return <div className={"tile " + k}><div className="tl"><i />{l}</div><div className="tv">{v}</div>{p && <div className="tp">{p}</div>}</div>;
}
function Rank({ rows }: { rows: { nombre: string; quien: Quien; trabajo: number; extra: number }[] }) {
  const max = Math.max(1, ...rows.map((a) => a.trabajo + a.extra));
  if (!rows.length) return <div className="hint">Sin datos.</div>;
  return <div className="rank">{rows.map((a, i) => { const tot = a.trabajo + a.extra; return (
    <div key={i} className="rk"><div className="who"><span className="nm">{a.nombre}</span><span className={"badge " + badgeCls[a.quien]}>{badgeTxt[a.quien]}</span></div>
      <div className="track"><i style={{ width: Math.max(3, tot / max * 100) + "%", background: `var(${roleColor[a.quien]})` }} /></div>
      <div className="amt">{fmtMXN(tot)}</div></div>); })}</div>;
}
function Field({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 3 }}>{l}</div><div style={{ fontWeight: strong ? 700 : 500, fontFamily: strong ? "var(--mono)" : "var(--sans)", color: strong ? "var(--pos)" : "var(--ink)" }}>{v}</div></div>;
}
