import { NextResponse } from "next/server";
import { z } from "zod";
import { editImage } from "@/lib/media";
import { currentOwner, logInteraction } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 120;

// El cliente reduce la imagen antes de enviarla; esto es solo un tope de seguridad.
const MAX_DATA_URL = 12 * 1024 * 1024;

const bodySchema = z.object({
  image: z
    .string()
    .max(MAX_DATA_URL, "La imagen es demasiado grande")
    .regex(/^data:image\/(png|jpeg|webp);base64,/, "Formato de imagen no válido"),
  instruction: z
    .string()
    .trim()
    .min(2, "Describe el cambio que quieres hacer")
    .max(500, "La instrucción es demasiado larga (máximo 500 caracteres)"),
});

/** Edita una imagen con IA siguiendo una instrucción. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const owner = currentOwner();
  const t0 = Date.now();
  try {
    const result = await editImage(parsed.data.image, parsed.data.instruction);
    logInteraction({ owner, kind: "image", provider: result.source, ok: true, latencyMs: Date.now() - t0, meta: { edit: true } });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo editar la imagen";
    logInteraction({ owner, kind: "image", ok: false, latencyMs: Date.now() - t0, error: message, meta: { edit: true } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
