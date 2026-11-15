"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthEnabled } from "@/components/Providers";

/**
 * Identidad del usuario actual.
 * - Con login activo: el email de Google (`userId`), nombre y avatar.
 * - Sin login configurado: un UUID anónimo guardado en el navegador, como antes.
 * `ready` es false mientras se resuelve la sesión.
 */
export function useCurrentUser() {
  const authEnabled = useAuthEnabled();
  const { data: session, status } = useSession();
  const [anonId, setAnonId] = useState<string | null>(null);

  useEffect(() => {
    if (authEnabled) return;
    let stored = localStorage.getItem("lingua-client-id");
    if (!stored) {
      stored = crypto.randomUUID();
      localStorage.setItem("lingua-client-id", stored);
    }
    setAnonId(stored);
  }, [authEnabled]);

  if (!authEnabled) {
    return { ready: anonId !== null, authEnabled, userId: anonId, name: null, email: null, avatar: null };
  }
  return {
    ready: status !== "loading",
    authEnabled,
    userId: session?.user?.id ?? null,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    avatar: session?.user?.image ?? null,
  };
}
