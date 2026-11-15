"use client";

import { useEffect } from "react";
// Se importa aquí (siempre montado) para capturar a tiempo el aviso de instalación.
import "@/lib/useInstallPrompt";

/**
 * Registra el service worker (app instalable y página sin conexión).
 * Solo en producción: en desarrollo la caché interferiría con la recarga en caliente,
 * así que allí se elimina cualquier registro previo.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* sin service worker la app funciona igual, solo no es instalable/offline */
    });
  }, []);
  return null;
}
