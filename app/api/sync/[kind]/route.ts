import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { dbError, readJson, syncOwner, unauthorized } from "@/lib/syncServer";
import { USER_DATA_KINDS, UserData } from "@/models/UserData";

export const runtime = "nodejs";

/** Por debajo del límite de 4,5 MB por petición de Vercel. */
const MAX_BYTES = 2_000_000;

const kindSchema = z.enum(USER_DATA_KINDS);
// Se valida la forma general (un objeto); el detalle lo normaliza el cliente al fusionar.
const bodySchema = z.object({ data: z.object({}).passthrough() });

type Ctx = { params: Promise<{ kind: string }> };

/** Ajustes, mazos o perfil guardados de la cuenta. */
export async function GET(_req: Request, { params }: Ctx) {
  const kind = kindSchema.safeParse((await params).kind);
  if (!kind.success) return NextResponse.json({ error: "Tipo de datos desconocido" }, { status: 404 });
  const owner = await syncOwner();
  if (!owner) return unauthorized();
  try {
    await connectDB();
    const doc = await UserData.findOne({ owner, kind: kind.data }).lean();
    return NextResponse.json({ data: doc ? JSON.parse(doc.data) : null });
  } catch (err) {
    return dbError(`GET ${kind.data}`, err);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const kind = kindSchema.safeParse((await params).kind);
  if (!kind.success) return NextResponse.json({ error: "Tipo de datos desconocido" }, { status: 404 });
  const owner = await syncOwner();
  if (!owner) return unauthorized();

  const body = await readJson(req, MAX_BYTES);
  if ("error" in body) return body.error;
  const parsed = bodySchema.safeParse(body.json);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    await connectDB();
    await UserData.findOneAndUpdate(
      { owner, kind: kind.data },
      { $set: { data: JSON.stringify(parsed.data.data) } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(`PUT ${kind.data}`, err);
  }
}
