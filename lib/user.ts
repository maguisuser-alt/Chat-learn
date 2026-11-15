import { auth } from "@/auth";
import { authEnabled } from "@/auth.config";
import { User } from "@/models/User";

/**
 * Identidad que usa el servidor para una petición.
 * - Con login de Google activo: SIEMPRE el email de la sesión; el `userId` que
 *   envía el navegador se ignora para que nadie pueda suplantar a otra cuenta.
 * - Sin login configurado (modo anónimo): el `clientId` que manda el navegador.
 * Devuelve null si no hay identidad válida.
 */
export async function resolveUserId(claimed?: string | null): Promise<string | null> {
  if (authEnabled) return (await auth())?.user?.id ?? null;
  return claimed || null;
}

/** Obtiene o crea el usuario asociado a un identificador (email o UUID anónimo). */
export async function getOrCreateUser(
  clientId: string,
  defaults?: { level?: string; targetLanguage?: string }
) {
  const update: Record<string, string> = {};
  if (defaults?.level) update.level = defaults.level;
  if (defaults?.targetLanguage) update.targetLanguage = defaults.targetLanguage;

  return User.findOneAndUpdate(
    { clientId },
    { $set: update, $setOnInsert: { clientId } },
    { upsert: true, new: true }
  );
}
