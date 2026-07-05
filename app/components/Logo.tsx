export function Logo({ className = "", mono = false }: { className?: string; mono?: boolean }) {
  // "team tac" — las dos t iniciales en degradado = los dos tiempos, tic y tac.
  // `mono` = todo el wordmark en el color actual (para fondos de color / oscuros,
  // donde el degradado violeta se perdería).
  const accent = mono ? "" : "curva-gradient-text";
  return (
    <span className={`font-brand font-bold tracking-tight lowercase ${className}`}>
      <span className={accent}>t</span>eam{" "}
      <span className={accent}>t</span>ac
    </span>
  );
}
