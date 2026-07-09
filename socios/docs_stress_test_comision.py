import random
random.seed(11)
U1,U2,U3=40000,80000,150000
BR=dict(chico=0.40,med=0.30,grande=0.20,tope=0.15)
PESO={'P':1.8,'E':1.5,'A':1.0}
COMIS_PCT=0.10; COMIS_TOPE=30000; ALPHA=0.60; AHORRO=0.15; SPLIT=0.60; CAJA=0.10

def bolsa(t):
    brs=[(U1,BR['chico']),(U2,BR['med']),(U3,BR['grande']),(float('inf'),BR['tope'])]
    b,prev=0,0
    for cap,r in brs:
        b+=r*max(0,min(t,cap)-prev); prev=cap
        if t<=cap: break
    return b
def equipo(t):
    if t<20000: return [('P','nucleo')]
    if t<60000: return [('P','nucleo'),('A','nucleo')]
    if t<120000: return [('P','nucleo'),('E','nucleo'),('A','nucleo')]
    return [('P','nucleo'),('E','nucleo'),('A','nucleo'),('A','nucleo')]

# politica: 'bolsillo' (socio cobra a su bolsillo) | 'banca' | 'sin'
def reparto(t, members, politica):
    sumw=sum(PESO[r] for r,q in members); bb=bolsa(t); vpw=bb/sumw if sumw else 0
    equipo_pay=sum(PESO[r]*vpw for r,q in members)  # todos nucleo, sin socios trabajando
    marginBruto=t-bb
    comis = 0 if politica=='sin' else min(COMIS_PCT*marginBruto, COMIS_TOPE)
    cajaProj=t*CAJA
    marginOp=marginBruto-comis-cajaProj
    cajaAhorro=marginOp*AHORRO
    utilidad=marginOp-cajaAhorro
    andres=utilidad*SPLIT; balmo=utilidad*(1-SPLIT)
    banca=cajaAhorro
    if politica=='bolsillo': andres+=comis           # Andrés originó → a su bolsillo
    elif politica=='banca':  banca+=comis            # va al colchón (de los dos)
    return dict(andres=andres,balmo=balmo,banca=banca,comis=comis,margin=marginBruto)

print("="*74)
print("PRUEBA A — DILUCIÓN entre socios (Andrés trae el lead y cobra comisión)")
print("  ¿Cuánto gana Andrés y cuánto PIERDE Balmo, vs no cobrar comisión?")
print("="*74)
print(f"  {'Ticket':>9} | {'comisión':>9} | {'Andrés Δ':>10} | {'Balmo Δ':>10} | señal")
for t in (40000,80000,120000,200000,360000):
    base=reparto(t,equipo(t),'sin')          # referencia: sin comisión
    boll=reparto(t,equipo(t),'bolsillo')     # Andrés cobra a su bolsillo
    dA=boll['andres']-base['andres']; dB=boll['balmo']-base['balmo']
    señal="⚠️ Balmo pierde sin comerla" if dB<-1 else ""
    print(f"  ${t:>7,} | ${boll['comis']:>7,.0f} | {dA:>+10,.0f} | {dB:>+10,.0f} | {señal}")

print()
print("="*74)
print("PRUEBA B — 3 políticas: ¿cuál NO genera pleito entre socios?")
print("  (proyecto $80k, Andrés originó)")
print("="*74)
t=80000
for pol,nombre in [('bolsillo','Socio cobra a su BOLSILLO (app hoy lo permite)'),
                   ('banca','Comisión de socio → BANCA (decisión Obsidian)'),
                   ('sin','SIN comisión')]:
    r=reparto(t,equipo(t),pol)
    print(f"\n  {nombre}:")
    print(f"    Andrés ${r['andres']:>9,.0f} | Balmo ${r['balmo']:>9,.0f} | Banca ${r['banca']:>9,.0f}")
    dif=r['andres']-r['balmo']
    print(f"    Brecha Andrés−Balmo: ${dif:,.0f}", end="")
    if pol=='bolsillo': print("  ❌ Andrés se lleva de más A COSTA de Balmo")
    elif pol=='banca': print("  ✅ el excedente va a la empresa (de los dos), sin diluir")
    else: print("  ✅ limpio")

print()
print("="*74)
print("PRUEBA C — ¿el TOPE de $30k desincentiva cerrar grande?")
print("="*74)
tope_en=None
for t in range(20000,600001,5000):
    r=reparto(t,equipo(t),'banca')
    if r['comis']>=COMIS_TOPE-1 and tope_en is None: tope_en=t
print(f"  La comisión toca el tope de $30k recién en un ticket de ~${tope_en:,} (margen ~$300k).")
print(f"  → En tu pipeline (máx $360k) casi nunca se topa. El tope NO estorba. ✅")

print()
print("="*74)
print("PRUEBA D — Comisión para NÚCLEO/EXTERNO (no-dueño): ¿sí incentiva sin diluir?")
print("="*74)
print("  Si quien trae el lead NO es dueño, cobrar comisión a su bolsillo NO le quita")
print("  utilidad a ningún socio (los no-dueños no comparten utilidad). Ahí la comisión")
print("  SÍ premia algo real. Regla: socio→Banca; Núcleo/externo→su bolsillo. ✅")
