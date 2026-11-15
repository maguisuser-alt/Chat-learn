import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, isDbConfigured } from "@/lib/mongodb";
import { currentOwner, hasShareConsent } from "@/lib/log";
import { Feedback, FEEDBACK_REASONS } from "@/models/Feedback";

export const runtime = "nodejs";

const bodySchema = z.object({
  messageId: z.string().min(1).max(80),
  conversationId: z.string().max(80).default(""),
  rating: z.enum(["up", "down"]),
  reason: z.enum(FEEDBACK_REASONS).optional(),
  provider: z.string().max(40).default(""),
  model: z.string().max(80).default(""),
  /** Solo se guardan si la cuenta dio permiso; el servidor lo comprueba. */
  question: z.string().max(2000).optional(),
  answer: z.string().max(6000).optional(),
});

/** Guarda (o corrige) la valoración de una respuesta. */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!isDbConfigured()) return NextResponse.json({ ok: false, stored: false });

  const d = parsed.data;
  const owner = await currentOwner();
  try {
    await connectDB();
    // El texto de la pregunta y la respuesta solo se guarda con el permiso de la cuenta.
    const withText = owner ? await hasShareConsent(owner) : false;
    await Feedback.findOneAndUpdate(
      { owner, messageId: d.messageId },
      {
        $set: {
          conversationId: d.conversationId,
          rating: d.rating,
          provider: d.provider,
          model: d.model,
          ...(d.rating === "down" && d.reason ? { reason: d.reason } : {}),
          ...(withText ? { question: d.question, answer: d.answer } : {}),
        },
        // Un 👍 posterior borra el motivo del 👎 anterior.
        ...(d.rating === "up" ? { $unset: { reason: "" } } : {}),
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.warn("[feedback]", err instanceof Error ? err.message : err);
    // La valoración es secundaria: no se muestra error al usuario.
    return NextResponse.json({ ok: false, stored: false });
  }
}
