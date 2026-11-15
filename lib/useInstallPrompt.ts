"use client";

import { useEffect, useState } from "react";

/** Evento de Chrome/Edge/Android para ofrecer la instalación (no está en los tipos del DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// El navegador lanza el evento una sola vez y pronto (antes de abrir Ajustes),
// así que se captura al cargar el módulo y se guarda para usarlo después.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // se ofrece desde Ajustes, no con el aviso automático
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type InstallState = "installed" | "available" | "ios" | "unsupported";

function currentState(): InstallState {
  if (typeof window === "undefined") return "unsupported";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (deferred) return "available";
  // Safari en iPhone/iPad no tiene botón de instalar: se hace desde Compartir.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return "unsupported";
}

/** Estado de instalación de la app y acción para instalarla. */
export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>("unsupported");

  useEffect(() => {
    const update = () => setState(currentState());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  async function install() {
    if (!deferred) return false;
    const ev = deferred;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    deferred = null;
    notify();
    if (outcome === "accepted") setState("installed");
    return outcome === "accepted";
  }

  return { state, install };
}
