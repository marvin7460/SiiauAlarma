import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "¿Hay Cupo?", template: "%s · ¿Hay Cupo?" },
  description:
    "Te avisa cuando se libera un lugar en una materia de la Universidad de Guadalajara. Proyecto independiente, no afiliado a la UdeG.",
  applicationName: "¿Hay Cupo?",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col bg-stone-50 font-sans text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-stone-900"
        >
          Saltar al contenido
        </a>
        <header className="border-b border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              ¿Hay <span className="text-emerald-700 dark:text-emerald-400">Cupo</span>?
            </Link>
            <nav aria-label="Principal" className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Buscar
              </Link>
            </nav>
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-stone-200 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
          <div className="mx-auto max-w-3xl space-y-2 px-4 py-6">
            <p>
              Proyecto independiente de un estudiante. <strong>No está afiliado</strong> a la
              Universidad de Guadalajara. Los datos vienen de la Consulta de Oferta Académica
              pública de SIIAU, que consultamos con cuidado para no saturarla.
            </p>
            <p>¿Hay Cupo? nunca te pide tu contraseña de SIIAU ni registra materias por ti.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
