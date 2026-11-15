"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

/** Debe coincidir con la clave que lee el script inicial de app/layout.tsx. */
const THEME_KEY = "lingua-theme";
const THEME_COLORS = { light: "#ffffff", dark: "#212121" } as const;

const isPref = (v: unknown): v is ThemePref => v === "system" || v === "light" || v === "dark";

/** Pone o quita la clase .dark en <html> y ajusta el color de la barra del sistema. */
function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

const ThemeContext = createContext<readonly [ThemePref, (p: ThemePref) => void]>(["system", () => {}]);

/** Tema de la app (por dispositivo). «Sistema» sigue el ajuste del sistema operativo. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPref] = useState<ThemePref>("system");
  // Hasta leer la preferencia guardada no se toca la clase que puso el script inicial.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (isPref(saved)) setPref(saved);
    } catch {
      /* sin acceso a localStorage */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref, loaded]);

  const update = useCallback((next: ThemePref) => {
    setPref(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* sin acceso a localStorage */
    }
  }, []);

  return <ThemeContext.Provider value={[pref, update] as const}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
