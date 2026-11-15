import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { dbError, readJson, syncOwner, unauthorized } from "@/lib/syncServer";
import { ChatThread } from "@/models/ChatThread";

export const runtime = "nodejs";

/** Por debajo del límite de 4,5 MB por petición de Vercel. */
const MAX_BYTES = 3_500_000;

const idSchema = z.string().min(1).max(80).regex(/^[\w-]+$/);
const chatSchema = z.object({
  title: z.string().max(200),
  gemId: z.string().max(80).nullable().optional(),
  updatedAt: z.number().int().positive(),
  messages: z.array(z.object({ id: z.string(), role: z.string(), parts: z.array(z.unknown()) }).passthrough()).max(2000),
});

type Ctx = { params: Promise<{ id: string }> };

async function chatId(params: Ctx["params"]) {
  const id = idSchema.safeParse((await params).id);
  return id.success ? id.data : null;
}

/** Un chat completo, con sus mensajes. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = await chatId(params);
  if (!id) return NextResponse.json({ error: "Chat inválido" }, { status: 400 });
  const owner = await syncOwner();
  if (!owner) return unauthorized();
  try {
    await connectDB();
    const doc = await ChatThread.findOne({ owner, chatId: id }).lean();
    if (!doc || doc.deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({
      chat: { id, title: doc.title, gemId: doc.gemId, updatedAt: doc.changedAt, messages: JSON.parse(doc.messages || "[]") },
    });
  } catch (err) {
    return dbError("GET chat", err);
  }
}

/** Guarda un chat. Si en el servidor hay una versión más reciente, no se sobrescribe. */
export async function PUT(req: Request, { params }: Ctx) {
  const id = await chatId(params);
  if (!id) return NextResponse.json({ error: "Chat inválido" }, { status: 400 });
  const owner = await syncOwner();
  if (!owner) return unauthorized();

  const body = await readJson(req, MAX_BYTES);
  if ("error" in body) return body.error;
  const parsed = chatSchema.safeParse((body.json as { chat?: unknown })?.chat);
  if (!parsed.success) return NextResponse.json({ error: "Chat inválido" }, { status: 400 });
  const chat = parsed.data;

  try {
    await connectDB();
    const current = await ChatThread.findOne({ owner, chatId: id }).select({ changedAt: 1 }).lean();
    if (current && current.changedAt > chat.updatedAt) {
      return NextResponse.json({ ok: false, stale: true, changedAt: current.changedAt });
    }
    await ChatThread.updateOne(
      { owner, chatId: id },
      {
        $set: {
          title: chat.title,
          gemId: chat.gemId ?? null,
          messages: JSON.stringify(chat.messages),
          changedAt: chat.updatedAt,
          deleted: false,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError("PUT chat", err);
  }
}

/** Borra un chat (queda una lápida para que el borrado llegue a los demás dispositivos). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = await chatId(params);
  if (!id) return NextResponse.json({ error: "Chat inválido" }, { status: 400 });
  const owner = await syncOwner();
  if (!owner) return unauthorized();
  try {
    await connectDB();
    await ChatThread.updateOne(
      { owner, chatId: id },
      { $set: { deleted: true, messages: "", title: "", changedAt: Date.now() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError("DELETE chat", err);
  }
}
