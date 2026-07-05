// El antiguo cajón "Análisis" (Insights + Equipo + Momentos bajo un sub-nav) se
// disolvió: cada uno es ahora un destino propio del nav global. Este grupo solo
// conserva el agrupamiento de rutas (invisible en la URL). Passthrough.
export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
