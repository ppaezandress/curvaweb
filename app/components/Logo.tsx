export function Logo({
  className = "",
  withDot = true,
}: {
  className?: string;
  withDot?: boolean;
}) {
  return (
    <span className={`font-display font-extrabold tracking-tight lowercase ${className}`}>
      curva
      {withDot && <span className="curva-gradient-text">.</span>}
    </span>
  );
}
