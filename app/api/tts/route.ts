import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSpeech, VOICES } from "@/lib/media";
import { currentOwner, logInteraction } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1, "No hay texto para leer").max(2000),
  voice: z.enum(VOICES).default("Kore"),
});

/** Lee un texto en voz alta con la voz natural de Gemini. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const owner = currentOwner();
  const t0 = Date.now();
  try {
    const audio = await generateSpeech(parsed.data.text, parsed.data.voice);
    logInteraction({ owner, kind: "audio", provider: audio.source, ok: true, latencyMs: Date.now() - t0, meta: { readAloud: true } });
    return NextResponse.json(audio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar el audio";
    logInteraction({ owner, kind: "audio", ok: false, latencyMs: Date.now() - t0, error: message, meta: { readAloud: true } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
