U1,U2,U3=40000,80000,150000
BR=dict(chico=.40,med=.30,grande=.20,tope=.15)
PESO={'P':1.8,'E':1.5,'A':1.0}
def bolsa(t):
    brs=[(U1,BR['chico']),(U2,BR['med']),(U3,BR['grande']),(float('inf'),BR['tope'])]
    b,prev=0,0
    for cap,r in brs:
        b+=r*max(0,min(t,cap)-prev);prev=cap
        if t<=cap:break
    return b

# members: (rol, quien)  quien in nucleo/socioA/socioB
def compute(t, members, alpha):
    sumw=sum(PESO[r] for r,q in members); bb=bolsa(t); vpw=bb/sumw if sumw else 0
    andres_seat=balmo_seat=disc=0; externo=0
    for r,q in members:
        g=PESO[r]*vpw
        if q=='socioA': andres_seat+=alpha*g; disc+=(1-alpha)*g
        elif q=='socioB': balmo_seat+=alpha*g; disc+=(1-alpha)*g
        else: externo+=g
    marginBruto=t-bb; cajaProj=t*.10
    marginOp=marginBruto-cajaProj      # sin comisión para aislar α
    cajaAhorro=marginOp*.15; utilidad=marginOp-cajaAhorro
    aU=utilidad*.60; bU=utilidad*.40
    banca=cajaAhorro+disc
    andres=andres_seat+aU; balmo=balmo_seat+bU
    en_casa=andres+balmo+banca        # todo lo que NO se va a externos
    return dict(andres=andres,balmo=balmo,banca=banca,externo=externo,en_casa=en_casa,andres_seat=andres_seat)

print("="*72)
print("PRUEBA 1 — ¿Mover α le quita dinero a CURVA? (proyecto $80k, Andrés de Piloto)")
print("="*72)
t=80000; members=[('P','socioA'),('E','nucleo')]
print(f"  {'α':>5} | {'Andrés cobra ahora':>18} | {'a la Banca':>11} | {'CURVA se queda':>14}")
for a in (0.50,0.60,0.70):
    r=compute(t,members,a)
    print(f"  {int(a*100):>4}% | ${r['andres_seat']:>16,.0f} | ${r['banca']:>9,.0f} | ${r['en_casa']:>12,.0f}")
print("  → CURVA se queda lo MISMO con cualquier α. Solo cambia: tu bolsa AHORA vs tu ahorro.")

print()
print("="*72)
print("PRUEBA 2 — ¿El sombrero del socio DILUYE al otro socio? (α=60%)")
print("="*72)
base=compute(t,[('P','nucleo'),('E','nucleo')],0.60)   # ninguno socio trabaja
conA=compute(t,[('P','socioA'),('E','nucleo')],0.60)   # Andrés entra de Piloto
print(f"  Sin socio trabajando:  Balmo ${base['balmo']:,.0f}")
print(f"  Andrés entra a chambear: Balmo ${conA['balmo']:,.0f}")
print(f"  → Balmo NO cambia (${conA['balmo']-base['balmo']:+,.0f}). Cero dilución. ✅")

print()
print("="*72)
print("PRUEBA 3 — La TENTACIÓN de acaparar: ¿conviene trabajar tú o delegar?")
print("="*72)
delega=compute(t,[('P','nucleo'),('E','nucleo')],0.60)
acapara=compute(t,[('P','socioA'),('E','nucleo')],0.60)
print(f"  Por proyecto:")
print(f"    Si DELEGAS (freelance de Piloto):  CURVA se queda ${delega['en_casa']:,.0f} | a externos ${delega['externo']:,.0f}")
print(f"    Si TÚ haces de Piloto:             CURVA se queda ${acapara['en_casa']:,.0f} | a externos ${acapara['externo']:,.0f}")
print(f"    → Acaparando se queda ${acapara['en_casa']-delega['en_casa']:,.0f} más EN ESE proyecto. Tentador.")
print()
print("  PERO tus manos son limitadas. En un mes:")
# acaparar: los 2 socios de Piloto -> ~3 proyectos. delegar: solo venden -> ~6 proyectos
acap_socios = 3*acapara['andres'] + 3*acapara['balmo']   # 3 proyectos, cada uno con un socio piloto
deleg_socios = 6*delega['andres'] + 6*delega['balmo']    # 6 proyectos, socios no trabajan
print(f"    ACAPARAR (trabajas): alcanzas ~3 proyectos → a socios ${acap_socios:,.0f}/mes")
print(f"    DELEGAR (vendes):    alcanzas ~6 proyectos → a socios ${deleg_socios:,.0f}/mes")
print(f"    → Delegar te deja ${deleg_socios-acap_socios:,.0f} MÁS al mes. Acaparar es una trampa.")
