import { NextResponse } from "next/server";
import { z } from "zod";
import { authEnabled } from "@/auth.config";
import { connectDB, isDbConfigured } from "@/lib/mongodb";
import { currentOwner } from "@/lib/log";
import { Conversation } from "@/models/Conversation";
import { Feedback } from "@/models/Feedback";
import { User } from "@/models/User";

export const runtime = "nodejs";

/** Permisos de la cuenta sobre sus datos. */
export async function GET() {
  if (!authEnabled) return NextResponse.json({ available: false });
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ available: false });
  try {
    await connectDB();
    const user = await User.findOne({ clientId: owner }).select("consent").lean();
    return NextResponse.json({ available: true, shareData: user?.consent?.shareData === true });
  } catch {
    return NextResponse.json({ available: false });
  }
}

const patchSchema = z.object({ shareData: z.boolean() });

/**
 * Activa o retira el permiso de guardar conversaciones.
 * Al retirarlo se borran las conversaciones guardadas y el texto de sus valoraciones.
 */
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!authEnabled) return NextResponse.json({ error: "Requiere cuenta" }, { status: 400 });
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });

  try {
    await connectDB();
    await User.findOneAndUpdate(
      { clientId: owner },
      {
        $set: { "consent.shareData": parsed.data.shareData, "consent.updatedAt": new Date() },
        $setOnInsert: { clientId: owner },
      },
      { upsert: true }
    );
    if (!parsed.data.shareData) {
      await Promise.all([
        Conversation.deleteMany({ owner }),
        Feedback.updateMany({ owner }, { $unset: { question: "", answer: "" } }),
      ]);
    }
    return NextResponse.json({ available: true, shareData: parsed.data.shareData });
  } catch (err) {
    console.warn("[me PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }
}
