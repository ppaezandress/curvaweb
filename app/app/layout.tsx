import type { Metadata } from "next";
import { Outfit } from "next/font/google";
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

export const metadata: Metadata = {
  title: "CURVA · Tiempos",
  description:
    "Medición de tiempos del equipo de CURVA — registra cuánto toma cada tarea, por persona y por proyecto.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} h-full antialiased`}>
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
