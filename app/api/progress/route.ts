import { NextResponse } from "next/server";
import { z } from "zod";
import { authEnabled } from "@/auth.config";
import { connectDB } from "@/lib/mongodb";
import { resolveUserId } from "@/lib/user";
import { UserProgress } from "@/models/UserProgress";

export const runtime = "nodejs";

const MAX_BYTES = 900_000;

// Se valida la forma general; el detalle lo normaliza el cliente al fusionar.
const progressSchema = z.object({
  streak: z.number().int().min(0).max(100_000),
  lastDay: z.string().max(10),
  todayXp: z.number().min(0).max(1_000_000),
  langs: z.record(z.string().max(40), z.object({}).passthrough()),
});

/** Solo hay sincronización con cuenta de Google: sin ella no hay identidad fiable. */
async function owner() {
  if (!authEnabled) return null;
  return resolveUserId(null);
}

export async function GET() {
  const id = await owner();
  if (!id) return NextResponse.json({ error: "Inicia sesión para sincronizar" }, { status: 401 });
  try {
    await connectDB();
    const doc = await UserProgress.findOne({ owner: id }).lean();
    return NextResponse.json({ data: doc ? JSON.parse(doc.data) : null });
  } catch (err) {
    console.error("[progress GET]", err);
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const id = await owner();
  if (!id) return NextResponse.json({ error: "Inicia sesión para sincronizar" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "El progreso es demasiado grande" }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = progressSchema.safeParse((json as { data?: unknown })?.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de progreso inválidos" }, { status: 400 });
  }

  try {
    await connectDB();
    await UserProgress.findOneAndUpdate(
      { owner: id },
      { $set: { data: JSON.stringify(parsed.data) } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[progress PUT]", err);
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }
}
