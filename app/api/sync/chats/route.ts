import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { dbError, syncOwner, unauthorized } from "@/lib/syncServer";
import { ChatThread } from "@/models/ChatThread";

export const runtime = "nodejs";

/** Cuántos chats (y lápidas) se listan como máximo, de los más recientes. */
const MAX_LIST = 300;

/** Índice de los chats de la cuenta, sin mensajes (se descargan uno a uno). */
export async function GET() {
  const owner = await syncOwner();
  if (!owner) return unauthorized();
  try {
    await connectDB();
    const docs = await ChatThread.find({ owner })
      .select({ chatId: 1, title: 1, gemId: 1, changedAt: 1, deleted: 1, _id: 0 })
      .sort({ changedAt: -1 })
      .limit(MAX_LIST)
      .lean();
    return NextResponse.json({
      chats: docs.map((d) => ({ id: d.chatId, title: d.title, gemId: d.gemId, changedAt: d.changedAt, deleted: d.deleted })),
    });
  } catch (err) {
    return dbError("GET chats", err);
  }
}

/** Borra todo el historial de la cuenta (deja lápidas para los demás dispositivos). */
export async function DELETE() {
  const owner = await syncOwner();
  if (!owner) return unauthorized();
  try {
    await connectDB();
    const now = Date.now();
    await ChatThread.updateMany({ owner, deleted: false }, { $set: { deleted: true, messages: "", title: "", changedAt: now } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError("DELETE chats", err);
  }
}
