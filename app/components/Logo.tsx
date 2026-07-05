export function Logo({ className = "" }: { className?: string }) {
  // "team tac" — las dos t iniciales en degradado = los dos tiempos, tic y tac.
  return (
    <span className={`font-brand font-bold tracking-tight lowercase ${className}`}>
      <span className="curva-gradient-text">t</span>eam{" "}
      <span className="curva-gradient-text">t</span>ac
    </span>
  );
}
