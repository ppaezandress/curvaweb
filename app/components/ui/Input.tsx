import { cn } from "@/lib/cn";

/** Clases base del input — reutilizables por cualquier control tipo texto. */
export const inputBase =
  "w-full rounded-control border border-line bg-surface px-3 py-2.5 text-body text-fg placeholder:text-muted transition focus-ring focus:border-accent disabled:opacity-50";

/** Input de texto. Soporta un ícono a la izquierda. */
export function Input({
  icon,
  className,
  ...props
}: { icon?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
        <input className={cn(inputBase, "pl-9", className)} {...props} />
      </div>
    );
  }
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "min-h-24 resize-y", className)} {...props} />;
}

/** Campo etiquetado: label + control + hint/error. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-caption font-medium text-fg">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-caption text-danger">{error}</p>
      ) : (
        hint && <p className="text-caption text-muted">{hint}</p>
      )}
    </div>
  );
}
