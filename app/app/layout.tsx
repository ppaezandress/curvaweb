import type { Metadata } from "next";
import { Outfit, Fraunces } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { DataProvider } from "@/lib/data-context";
import { CelebrateProvider } from "@/lib/celebrate-context";
import { HostGuard } from "@/components/HostGuard";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

// Fuente de marca: serif óptico con carácter (warmth, distinción). Solo momentos grandes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "team tac",
  description:
    "El tiempo del equipo, un tac a la vez — registra cuánto toma cada tarea, por persona y por proyecto.",
};

// Aplica el tema ANTES del primer paint (evita flash de tema claro al recargar
// en oscuro). Lee la preferencia del dispositivo: "dark" | "light" | "system".
const themeScript = `(function(){try{var t=localStorage.getItem("curva.theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <HostGuard />
        <DataProvider>
          <AppProvider>
            <CelebrateProvider>{children}</CelebrateProvider>
          </AppProvider>
        </DataProvider>
      </body>
    </html>
  );
}
