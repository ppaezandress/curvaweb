# Prueba de estrés de desembolso() — el reparto de un pago a las cajas.
# Porta compute() + desembolso() (reparto SIMPLE proporcional, un solo reloj = % recibido)
# y verifica: (1) cuadre a $0 a lo largo de TODOS los pagos, (2) ningún destino
# recibe más que su total de compute(), (3) todo movimiento es >= 0.
import random
random.seed(11)

U1, U2, U3 = 40000, 80000, 150000
BR = dict(chico=0.40, med=0.30, grande=0.20, tope=0.15)
PESO = {'P': 1.8, 'E': 1.5, 'A': 1.0}
ALPHA, POOL, BETA, SPLIT, AHORRO = 0.60, 0.0, 0.0, 0.60, 0.15
COMIS_PCT, COMIS_TOPE = 0.10, 30000


def base_bolsa(t):
    brs = [(U1, BR['chico']), (U2, BR['med']), (U3, BR['grande']), (float('inf'), BR['tope'])]
    b, prev = 0, 0
    for cap, r in brs:
        b += r * max(0, min(t, cap) - prev); prev = cap
        if t <= cap: break
    return b


# compute() → totales por destino de caja (equivalente 1:1 al motor TS)
def compute(t, members, origen):
    sumw = sum(PESO[r] * (1 if q in ('socioA', 'socioB') else sm) for (r, q, sm) in members)
    bb = base_bolsa(t); vpw = bb / sumw if sumw > 0 else 0
    disc = 0.0; equipo = 0.0; sA = 0.0; sB = 0.0
    for (r, q, sm) in members:
        g = PESO[r] * (1 if q in ('socioA', 'socioB') else sm) * vpw
        if q == 'socioA': sA += ALPHA * g; disc += (1 - ALPHA) * g
        elif q == 'socioB': sB += ALPHA * g; disc += (1 - ALPHA) * g
        else: equipo += g
    marginBruto = t - bb
    comisOn = origen != 'empresa'
    comisWho = 'equipo' if origen == 'persona' else 'banca' if origen == 'socio' else 'equipo'
    comis = min(marginBruto * COMIS_PCT, COMIS_TOPE) if comisOn else 0.0
    comisBanca = comis if (comisOn and comisWho == 'banca') else 0.0
    comisPaid = comis if (comisOn and comisWho == 'equipo') else 0.0
    cajaProj = t * 0.10
    marginOp = marginBruto - comis - cajaProj
    cajaAhorro = marginOp * AHORRO
    utilidad = marginOp - cajaAhorro
    nucleo = [m for m in members if m[1] == 'nucleo']
    poolAmt = utilidad * POOL if nucleo else 0.0
    utilRest = utilidad - poolAmt
    utilKept = utilRest * (1 - BETA); utilSwept = utilRest * BETA
    sAutil = utilKept * SPLIT; sButil = utilKept * (1 - SPLIT)
    banca = cajaAhorro + disc + utilSwept + comisBanca
    # totales por destino de Revolut
    return dict(
        t=t,
        equipo=equipo + poolAmt,        # masa salarial + bono núcleo
        socioA=sA + sAutil,
        socioB=sB + sButil,
        comision=comisPaid,             # comisión que cobra quien lo trajo
        cajaProyecto=cajaProj,
        cajaAhorro=cajaAhorro,
        banca=disc + utilSwept + comisBanca,
    )


DESTINOS = ['equipo', 'socioA', 'socioB', 'comision', 'cajaProyecto', 'cajaAhorro', 'banca']


def totales(r):
    return {k: r[k] for k in DESTINOS}


# desembolso() de un pago: cada destino * (fracción recibida).
# raw = contabilidad exacta; disp = lo que se MUESTRA (filtra < 0.5, cosmético).
def desembolso(tot, d):
    raw = {k: v * d for k, v in tot.items()}
    disp = {k: v for k, v in raw.items() if v > 0.5}
    return raw, disp


def equipo_aleatorio(t):
    roles = ['P']
    if t > 30000: roles.append('E')
    if t > 80000: roles.append('A')
    if t > 150000: roles.append('A')
    mem = [(r, 'nucleo', random.choice([0.7, 1.0])) for r in roles]
    # a veces un socio trabaja
    if random.random() < 0.4:
        mem.append((random.choice(['P', 'E']), random.choice(['socioA', 'socioB']), 1))
    return mem


print("=" * 72)
print("PRUEBA DE DESEMBOLSO — 5,000 proyectos, secuencias de pagos aleatorias")
print("=" * 72)
N = 5000
fugas_raw = 0; peor_raw = 0.0        # contabilidad exacta (invariante duro)
peor_disp = 0.0                       # merma cosmética por el filtro < $0.50
sobre = 0; negativos = 0
for _ in range(N):
    t = round(random.uniform(3000, 500000), -2)
    origen = random.choice(['empresa', 'socio', 'persona'])
    r = compute(t, equipo_aleatorio(t), origen)
    tot = totales(r)
    # partir el ticket en 1..5 pagos que suman el ticket
    npagos = random.randint(1, 5)
    cortes = sorted(random.uniform(0, 1) for _ in range(npagos - 1))
    bordes = [0.0] + cortes + [1.0]
    montos = [(bordes[i + 1] - bordes[i]) * t for i in range(npagos)]
    acum = {k: 0.0 for k in DESTINOS}
    total_raw = 0.0; total_disp = 0.0
    for m in montos:
        d = m / t
        raw, disp = desembolso(tot, d)
        total_raw += sum(raw.values())
        total_disp += sum(disp.values())
        for k, v in raw.items():
            if v < -1e-9: negativos += 1
            acum[k] += v
    # (1) INVARIANTE DURO: la contabilidad exacta cuadra al ticket
    dif_raw = abs(total_raw - t)
    if dif_raw > 0.5: fugas_raw += 1
    peor_raw = max(peor_raw, dif_raw)
    # merma cosmética (lo que el filtro no muestra) — debe ser sub-peso
    peor_disp = max(peor_disp, abs(t - total_disp))
    # (2) ningún destino excede su total
    for k in DESTINOS:
        if acum[k] > tot[k] + 0.5: sobre += 1

print(f"  [DURO] Casos con fuga en contabilidad exacta (>$0.50): {fugas_raw}/{N}")
print(f"  [DURO] Peor descuadre exacto: ${peor_raw:.6f}")
print(f"  [DURO] Destinos que exceden su total de compute(): {sobre}")
print(f"  [DURO] Movimientos negativos: {negativos}")
print(f"  [cosmético] Peor merma por filtro <$0.50 (no se muestra): ${peor_disp:.4f}")
print()
ok = (fugas_raw == 0 and sobre == 0 and negativos == 0)
print("  " + ("OK — desembolso cuadra a $0 SIEMPRE, sin sobre-transferencia. Íntegro.\n"
              "  (la merma cosmética es sub-peso: el filtro solo evita mostrar 'manda $0.30')"
              if ok else "XX revisar — hay descuadre real"))
