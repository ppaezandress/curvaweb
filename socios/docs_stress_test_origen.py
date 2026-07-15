# Pruebas de estrés del selector "¿Quién trajo este cliente?" (comisión de origen).
# Porta compute() de lib/reparto.ts (mismas constantes) y prueba las 3 opciones:
#   marca (empresa) · socio · persona (equipo/externo).
# Verifica: (1) integridad cuadra a $0, (2) efecto real marca-vs-socio,
# (3) dilución que justifica el blindaje, (4) INCENTIVO PERVERSO: ¿puede un socio
# enriquecerse a costa del otro clasificando mal?
import random
random.seed(13)

U1, U2, U3 = 40000, 80000, 150000
BR = [0.40, 0.30, 0.20, 0.15]
PESO = {'P': 1.8, 'E': 1.5, 'A': 1.0}
ALPHA, SPLIT, AHORRO = 0.60, 0.60, 0.15
COMIS_PCT, COMIS_TOPE, CAJA = 0.10, 30000, 0.10


def base_bolsa(t):
    brs = [(U1, BR[0]), (U2, BR[1]), (U3, BR[2]), (float('inf'), BR[3])]
    b, prev = 0.0, 0.0
    for cap, r in brs:
        b += r * max(0, min(t, cap) - prev); prev = cap
        if t <= cap: break
    return b


# origen ∈ {'empresa','socio','persona'} · quien_lo_trajo = nombre (solo si persona)
def compute(t, members, origen='empresa', quien_lo_trajo=None):
    sumw = sum(PESO[r] * (1 if q in ('socioA', 'socioB') else sm) for (r, q, sm) in members)
    bb = base_bolsa(t); vpw = bb / sumw if sumw > 0 else 0
    disc = sAseat = sBseat = equipo = 0.0
    for (r, q, sm) in members:
        g = PESO[r] * (1 if q in ('socioA', 'socioB') else sm) * vpw
        if q == 'socioA': sAseat += ALPHA * g; disc += (1 - ALPHA) * g
        elif q == 'socioB': sBseat += ALPHA * g; disc += (1 - ALPHA) * g
        else: equipo += g
    marginBruto = t - bb
    comisOn = origen != 'empresa'
    # Blindaje (igual que lib/reparto.ts): si lo trajo un socio, la comisión → Banca.
    trajo_socio = origen == 'persona' and quien_lo_trajo in ('Andrés', 'Balmo')
    comisWho = ('banca' if trajo_socio else 'equipo') if origen == 'persona' else ('banca' if origen == 'socio' else 'equipo')
    comis = min(marginBruto * COMIS_PCT, COMIS_TOPE) if comisOn else 0.0
    comisBanca = comis if (comisOn and comisWho == 'banca') else 0.0
    comisPaid = comis if (comisOn and comisWho == 'equipo') else 0.0
    cajaProj = t * CAJA
    marginOp = marginBruto - comis - cajaProj
    cajaAhorro = marginOp * AHORRO
    utilidad = marginOp - cajaAhorro
    sAutil, sButil = utilidad * SPLIT, utilidad * (1 - SPLIT)
    banca = cajaAhorro + disc + comisBanca
    # comisPaid va a quien lo trajo (equipo, externo... o un socio si el UI lo permite)
    cp_a = comisPaid if quien_lo_trajo == 'Andrés' else 0.0
    cp_b = comisPaid if quien_lo_trajo == 'Balmo' else 0.0
    cp_eq = comisPaid - cp_a - cp_b
    andres = sAseat + sAutil + cp_a
    balmo = sBseat + sButil + cp_b
    equipo_total = equipo + cp_eq
    return dict(t=t, andres=andres, balmo=balmo, equipo=equipo_total, cajaProj=cajaProj,
                banca=banca, comis=comis, marginBruto=marginBruto, sAutil=sAutil, sButil=sButil)


def equipo_rand(t, con_socio=False):
    roles = ['P']
    if t > 30000: roles.append('E')
    if t > 80000: roles.append('A')
    mem = [(r, 'nucleo', random.choice([0.7, 1.0])) for r in roles]
    if con_socio:
        mem.append((random.choice(['P', 'E']), random.choice(['socioA', 'socioB']), 1))
    return mem


print("=" * 74)
print("1) INTEGRIDAD — el reparto cuadra a $0 en las 3 opciones (5,000 c/u)")
print("=" * 74)
fugas = 0; peor = 0.0
for _ in range(5000):
    t = round(random.uniform(3000, 500000), -2)
    m = equipo_rand(t, con_socio=random.random() < 0.4)
    for origen, quien in [('empresa', None), ('socio', None), ('persona', 'Lomba')]:
        r = compute(t, m, origen, quien)
        suma = r['andres'] + r['balmo'] + r['equipo'] + r['cajaProj'] + r['banca']
        d = abs(t - suma)
        if d > 0.5: fugas += 1
        peor = max(peor, d)
print(f"   Casos con fuga (>$0.50): {fugas}/15000   |   peor descuadre: ${peor:.6f}")
print("   " + ("OK — cuadra a $0 SIEMPRE en las 3 opciones." if fugas == 0 else "XX revisar"))

print()
print("=" * 74)
print("2) 'LA MARCA' vs 'UN SOCIO' — ¿qué cambia exactamente? (mismo proyecto)")
print("=" * 74)
print("   Es un desvío del margen: con 'socio' el 10% sale de la UTILIDAD y va a la BANCA.")
print(f"   {'Ticket':>9} | {'Andrés Δ':>10} {'Balmo Δ':>10} {'Banca Δ':>10} | {'CURVA total Δ':>13}")
for t in [30000, 80000, 150000, 360000]:
    m = equipo_rand(t)
    a = compute(t, m, 'empresa')
    b = compute(t, m, 'socio')
    dA, dB, dBanca = b['andres'] - a['andres'], b['balmo'] - a['balmo'], b['banca'] - a['banca']
    curvaA = a['andres'] + a['balmo'] + a['banca']
    curvaB = b['andres'] + b['balmo'] + b['banca']
    print(f"   ${t:>8,} | ${dA:>9,.0f} ${dB:>9,.0f} ${dBanca:>9,.0f} | ${curvaB - curvaA:>12,.0f}")
print("   → Andrés y Balmo ceden en proporción 60/40; la Banca gana lo mismo.")
print("   → CURVA total (socios+Banca) NO cambia: es puro utilidad↔ahorro, sin fuga.")

print()
print("=" * 74)
print("3) LAS 3 CLASIFICACIONES de un deal que trajo ANDRÉS — a dónde va el dinero")
print("=" * 74)
print(f"   {'Ticket':>9} | {'opción':>16} | {'Andrés':>9} {'Balmo':>9} {'Banca':>9}")
for t in [80000, 360000]:
    m = equipo_rand(t)
    for etq, o, quien in [("La marca", 'empresa', None), ("Un socio (regla)", 'socio', None), ("Equipo+Andrés 🚩", 'persona', 'Andrés')]:
        r = compute(t, m, o, quien)
        print(f"   ${t:>8,} | {etq:>16} | ${r['andres']:>8,.0f} ${r['balmo']:>8,.0f} ${r['banca']:>8,.0f}")
    print("   " + "-" * 66)
print("   'La marca' y 'Un socio' NUNCA pagan comisión a un socio. El problema es")
print("   'Equipo' + nombre de un socio: le mete la comisión al bolsillo del socio.")

print()
print("=" * 74)
print("4) INCENTIVO PERVERSO — ¿un socio puede robarse la comisión vía 'Equipo'?")
print("=" * 74)
casos = 0; peor_gana = 0.0; peor_banca = 0.0
for _ in range(4000):
    t = round(random.uniform(20000, 400000), -2)
    m = equipo_rand(t)
    honesto = compute(t, m, 'socio', None)               # regla: comisión de socio → Banca
    trampa = compute(t, m, 'persona', 'Andrés')          # se declara 'Equipo' y se nombra a sí mismo
    gana = trampa['andres'] - honesto['andres']          # lo que Andrés se embolsa de más
    banca_pierde = honesto['banca'] - trampa['banca']    # lo que pierde el colchón compartido
    if gana > 1 and banca_pierde > 1:
        casos += 1; peor_gana = max(peor_gana, gana); peor_banca = max(peor_banca, banca_pierde)
print(f"   Proyectos donde la trampa enriquece a un socio robando de la Banca: {casos}/4000")
print(f"   Peor caso: Andrés se embolsa +${peor_gana:,.0f} que salen de la Banca (−${peor_banca:,.0f}).")
print()
if casos:
    print("   🚨 HALLAZGO CONFIRMADO: la comisión de socio NO diluye el pago directo del otro")
    print("      socio, pero SÍ vacía la Banca (el colchón que es 60/40 de ambos). Un socio")
    print("      puede convertir ese ahorro compartido en dinero personal eligiendo 'Equipo'")
    print("      y su propio nombre. FIX: excluir a los socios de la lista '¿quién lo trajo?'.")
else:
    print("   OK — no hay forma de que un socio cobre comisión propia. Blindaje intacto.")
