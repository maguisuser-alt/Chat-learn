"use client";

import { createContext, useContext } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme";

const AuthEnabledContext = createContext(false);

/** `true` si el login con Google está configurado en el servidor. */
export const useAuthEnabled = () => useContext(AuthEnabledContext);

export default function Providers({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <AuthEnabledContext.Provider value={authEnabled}>
      <ThemeProvider>
        <SessionProvider>{children}</SessionProvider>
      </ThemeProvider>
    </AuthEnabledContext.Provider>
  );
}
