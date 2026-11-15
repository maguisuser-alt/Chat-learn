import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import ServiceWorker from "@/components/ServiceWorker";
import { authEnabled } from "@/auth.config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lingua Tutor",
  description: "Estudio de idiomas con planes adaptativos y tutor de IA",
  applicationName: "Lingua Tutor",
  appleWebApp: { capable: true, title: "Lingua Tutor", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Aplica el tema guardado antes de pintar, para evitar un destello claro en modo oscuro. */
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("lingua-theme")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#212121");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // La clase .dark la pone el script antes de hidratar: se evita el aviso de diferencia.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers authEnabled={authEnabled}>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
