import type { MetadataRoute } from "next";

/** Manifiesto para instalar Lingua Tutor como app (PWA). Next lo sirve en /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lingua Tutor",
    short_name: "Lingua",
    description: "Tutor de estudio con IA: chat, tarjetas, exámenes y aprendizaje de idiomas.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10a37f",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
