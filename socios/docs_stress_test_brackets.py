import random
random.seed(7)
U1,U2,U3 = 40000,80000,150000
BR = dict(chico=0.40, med=0.30, grande=0.20, tope=0.15)
FLAT = 0.30
PESO = {'P':1.8,'E':1.5,'A':1.0}

def b_marginal(t):
    brs=[(U1,BR['chico']),(U2,BR['med']),(U3,BR['grande']),(float('inf'),BR['tope'])]
    b,prev=0,0
    for cap,r in brs:
        b+=r*max(0,min(t,cap)-prev); prev=cap
        if t<=cap: break
    return b
def b_plano(t):
    p = BR['chico'] if t<=U1 else BR['med'] if t<=U2 else BR['grande'] if t<=U3 else BR['tope']
    return t*p
def b_unico(t): return t*FLAT
METODOS={"MARGINAL":b_marginal,"PLANO":b_plano,"UNICO 30%":b_unico}

def equipo_por_tamano(t):
    if t<20000: return [('P','nucleo',1)]
    if t<60000: return [('P','nucleo',1),('A','nucleo',1)]
    if t<120000: return [('P','nucleo',1),('E','nucleo',1),('A','nucleo',1)]
    return [('P','nucleo',1),('E','nucleo',1),('A','nucleo',1),('A','nucleo',1)]

def compute(t, members, bolsa_fn):
    sumw=sum(PESO[r]*sm for (r,q,sm) in members)
    bb=bolsa_fn(t); vpw=bb/sumw if sumw>0 else 0
    pay=[]; disc=0
    for (r,q,sm) in members:
        g=PESO[r]*sm*vpw
        if q in('socioA','socioB'): p=0.60*g; disc+=0.40*g
        else: p=g
        pay.append(p)
    marginBruto=t-bb
    comis=min(marginBruto*0.10,30000)
    cajaProj=t*0.10
    marginOp=marginBruto-comis-cajaProj
    cajaAhorro=marginOp*0.15
    utilidad=marginOp-cajaAhorro
    socios=utilidad
    banca=cajaAhorro+disc+comis
    equipo=sum(pay)
    curva=socios+banca
    return dict(equipo=equipo,socios=socios,banca=banca,curva=curva,cajaProj=cajaProj)

pipeline=[("Wellness",360000),("ESFLO",72000),("Mouli",90000),("Ticket2Go",90000),("Web Charly",5000),("Texcoco",12500)]
print("="*72)
print("ESCENARIO 1 - TU PIPELINE REAL (cuanto se queda CURVA con cada metodo)")
print("="*72)
tot_facturado=sum(t for _,t in pipeline)
for nombre,f in METODOS.items():
    T=dict(equipo=0,socios=0,banca=0,curva=0)
    for _,t in pipeline:
        r=compute(t,equipo_por_tamano(t),f)
        for k in T: T[k]+=r[k]
    print(f"\n  {nombre}:  (facturado ${tot_facturado:,})")
    print(f"    -> al EQUIPO (freelancers): ${T['equipo']:>10,.0f}  ({T['equipo']/tot_facturado*100:4.1f}%)")
    print(f"    -> a CURVA (tu+Balmo+Banca): ${T['curva']:>10,.0f}  ({T['curva']/tot_facturado*100:4.1f}%)")
    print(f"         . ganancia socios:     ${T['socios']:>10,.0f}")
    print(f"         . colchon Banca:       ${T['banca']:>10,.0f}")

print()
print("="*72)
print("ESCENARIO 2 - MONTE CARLO (5,000 proyectos aleatorios $5k-$400k)")
print("="*72)
N=5000
resultados={}
for nombre,f in METODOS.items():
    tot_eq=tot_curva=tot_fact=0
    perversos=0
    for _ in range(N):
        t=round(random.uniform(5000,400000),-2)
        m=equipo_por_tamano(t)
        r=compute(t,m,f)
        tot_eq+=r['equipo']; tot_curva+=r['curva']; tot_fact+=t
        r2=compute(t*1.10, m, f)
        if r2['equipo'] < r['equipo']-1e-6: perversos+=1
    resultados[nombre]=(tot_curva/tot_fact*100, perversos)
    print(f"\n  {nombre}:")
    print(f"    Equipo se lleva:  {tot_eq/tot_fact*100:4.1f}% del facturado")
    print(f"    CURVA se queda:   {tot_curva/tot_fact*100:4.1f}% del facturado")
    print(f"    Incentivo perverso (vender +10% paga MENOS): {perversos}/{N}  {'XX te desfalca' if perversos else 'OK limpio'}")

print()
print("="*72)
print("VEREDICTO")
print("="*72)
for nombre,(pct,perv) in resultados.items():
    tag = "DESCARTADO (te desfalca)" if perv>0 else "SANO"
    print(f"  {nombre:12} CURVA se queda {pct:4.1f}% | incentivo perverso: {perv} | {tag}")

# ---------- PRUEBA DE INTEGRIDAD: ¿el reparto SIEMPRE cuadra a $0? ----------
print()
print("="*72)
print("PRUEBA DE INTEGRIDAD - el reparto nunca pierde ni un peso (5,000 casos)")
print("="*72)
fugas=0; peor=0
for _ in range(5000):
    t=round(random.uniform(3000,500000),-2)
    m=equipo_por_tamano(t)
    r=compute(t,m,b_marginal)
    # todo lo que sale debe sumar el ticket: equipo + cajaProj + curva(socios+banca)
    suma=r['equipo']+r['cajaProj']+r['curva']
    dif=abs(t-suma)
    if dif>0.5: fugas+=1
    peor=max(peor,dif)
print(f"  Casos con fuga (>$0.50): {fugas}/5000   |  peor descuadre: ${peor:.4f}")
print("  " + ("OK - cuadra a $0 SIEMPRE. Motor integro." if fugas==0 else "XX revisar"))
