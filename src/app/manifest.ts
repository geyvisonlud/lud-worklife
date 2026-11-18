import type { MetadataRoute } from "next";

/** Installs as an app: "Add to Home Screen" on iPhone, "Install" on Android/desktop Chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lud Worklife",
    short_name: "Worklife",
    description: "Projects, tasks and every calendar in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0c0b",
    theme_color: "#0c0c0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
