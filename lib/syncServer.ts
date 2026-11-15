import { NextResponse } from "next/server";
import { authEnabled } from "@/auth.config";
import { resolveUserId } from "@/lib/user";

/** Solo se sincroniza con cuenta de Google: sin ella no hay identidad fiable. */
export async function syncOwner(): Promise<string | null> {
  if (!authEnabled) return null;
  return resolveUserId(null);
}

export const unauthorized = () => NextResponse.json({ error: "Inicia sesión para sincronizar" }, { status: 401 });

export function dbError(where: string, err: unknown) {
  console.error(`[sync ${where}]`, err);
  return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
}

/** Lee el cuerpo JSON con un tamaño máximo. Devuelve una respuesta de error si no es válido. */
export async function readJson(req: Request, maxBytes: number): Promise<{ json: unknown } | { error: NextResponse }> {
  const raw = await req.text();
  if (raw.length > maxBytes) {
    return { error: NextResponse.json({ error: "Los datos son demasiado grandes" }, { status: 413 }) };
  }
  try {
    return { json: JSON.parse(raw) };
  } catch {
    return { error: NextResponse.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}
