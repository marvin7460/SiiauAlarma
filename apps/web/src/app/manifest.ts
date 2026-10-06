import type { MetadataRoute } from "next";

/**
 * Lets students "install" the site. On iPhone this is required for notifications: Safari only
 * allows Web Push to sites added to the home screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "¿Hay Cupo?",
    short_name: "Hay Cupo",
    description:
      "Te avisa cuando se libera un lugar en una materia de la Universidad de Guadalajara.",
    lang: "es-MX",
    start_url: "/alertas",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#047857",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
