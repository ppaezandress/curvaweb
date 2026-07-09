OVERHEAD = 360+1800+360+400+800   # ChatGPT+ClaudeMax+Claude+Notion+Contadora
SUELDO_NUCLEO = 8000              # un sueldo mensual aprox del Núcleo
META_ACTUAL = 96000
PISO_NUCLEO_TOTAL = 32000         # 4 personas (de dónde salía la meta)

print("="*70)
print("EL PROBLEMA: la meta de $96k venía de '3 meses de sueldos del Núcleo'")
print("  ...pero ya NO pagas sueldos garantizados. ¿Sigue teniendo sentido?")
print("="*70)
print(f"  Overhead (gastos fijos) al mes: ${OVERHEAD:,}")
print()
print("  ¿Qué cubre la meta actual de $96,000?")
print(f"    • {META_ACTUAL/OVERHEAD:.0f} MESES de gastos fijos (overhead)  ← muchísimo")
print(f"    • {META_ACTUAL/SUELDO_NUCLEO:.0f} meses de UN sueldo del Núcleo ($8k)")
print(f"    • {META_ACTUAL/PISO_NUCLEO_TOTAL:.0f} meses del Núcleo COMPLETO con sueldo ($32k) ← el origen, ya no aplica")

print()
print("="*70)
print("REFERENCIAS para decidir una meta CON SENTIDO (según para qué es el colchón)")
print("="*70)
opciones = [
    ("Emergencia mínima: 6 meses de gastos fijos", 6*OVERHEAD),
    ("Trampolín: pasar 1 persona a nómina 6 meses", 6*SUELDO_NUCLEO),
    ("Cómodo: emergencia + 1 nómina, ~6 meses", 6*(OVERHEAD+SUELDO_NUCLEO)),
    ("Actual (heredado, 3 meses Núcleo completo)", META_ACTUAL),
]
for nombre, monto in opciones:
    print(f"    ${monto:>7,}  — {nombre}")

print()
print("="*70)
print("¿SE LLENA RÁPIDO? — Banca que genera tu pipeline real")
print("="*70)
# Del análisis previo: pipeline real ($629,500) genera ~$99,456 de Banca (marginal, sin comisión a socios)
BANCA_PIPELINE = 99456
print(f"  Tu pipeline real (~$630k, varios meses) genera ~${BANCA_PIPELINE:,} de Banca.")
print(f"  → Con eso YA superas la meta actual de $96k. La caja de ahorro (15%) llena bien.")
print(f"  → Si bajas la meta a algo más realista (~$45k), la cubres con 2-3 buenos proyectos.")
