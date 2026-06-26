export function Logo({
  className = "",
  withDot = true,
}: {
  className?: string;
  withDot?: boolean;
}) {
  return (
    <span className={`font-brand font-bold tracking-tight lowercase ${className}`}>
      curva
      {withDot && <span className="curva-gradient-text">.</span>}
    </span>
  );
}
