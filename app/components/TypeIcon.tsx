import {
  BarChart3,
  Users,
  ListChecks,
  Network,
  Presentation,
  GraduationCap,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  benchmark: BarChart3,
  reclutamiento: Users,
  procesos: ListChecks,
  organigrama: Network,
  propuesta: Presentation,
  capacitacion: GraduationCap,
  notion: Sparkles,
};

export function TypeIcon({
  typeId,
  className,
  size = 16,
}: {
  typeId: string;
  className?: string;
  size?: number;
}) {
  const Icon = ICONS[typeId] ?? ListChecks;
  return <Icon className={className} size={size} strokeWidth={2.2} />;
}
