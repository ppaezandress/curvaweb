"use client";

// Switch reutilizable (etiqueta + hint + interruptor). Lo usan Privacidad e Integraciones.
export function Toggle({
  icon,
  label,
  hint,
  on,
  onChange,
  tone = "accent",
}: {
  icon?: React.ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  tone?: "accent" | "purple" | "indigo";
}) {
  // El interruptor encendido siempre usa el acento (tono legado se ignora).
  void tone;
  const onBg = "bg-accent";
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div>
          <p className="text-sm font-medium text-fg">{label}</p>
          <p className="text-caption text-muted">{hint}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring ${on ? onBg : "bg-line"}`}
      >
        {/* El knob se mueve con transform (GPU), no con `left`; ease-out custom bajo 300ms. */}
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform duration-200 ease-out ${on ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
