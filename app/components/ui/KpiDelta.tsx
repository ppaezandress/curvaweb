import { Stat, toDelta } from "./Stat";

/** KPI con flecha de delta vs periodo anterior (card + Stat). */
export function KpiDelta({
  icon,
  label,
  value,
  curr,
  prev,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  curr: number;
  prev: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <Stat icon={icon} label={label} value={value} delta={toDelta(curr, prev)} hint={hint} />
    </div>
  );
}
