import { NextResponse } from "next/server";
import { generateObject } from "ai";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/lib/ai";
import { guideSummarySchema, LEVELS } from "@/lib/schemas";
import { getOrCreateUser, resolveUserId } from "@/lib/user";
import { StudyGuide } from "@/models/StudyGuide";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_STORED_CHARS = 200_000;
const MAX_PROMPT_CHARS = 60_000;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const userId = (await resolveUserId(String(form.get("userId") ?? ""))) ?? "";
    const level = String(form.get("level") ?? "A1");
    const targetLanguage = String(form.get("targetLanguage") ?? "Inglés");

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un archivo PDF en 'file'" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 415 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "El PDF supera los 10 MB" }, { status: 413 });
    }
    if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
      return NextResponse.json({ error: "Nivel inválido" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buffer);
    const text = parsed.text.replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 50) {
      return NextResponse.json(
        { error: "No se pudo extraer texto (¿PDF escaneado como imagen?)" },
        { status: 422 }
      );
    }

    const { object } = await generateObject({
      model: getModel(),
      schema: guideSummarySchema,
      system:
        "Eres un pedagogo de idiomas. Analizas guías de estudio y produces resúmenes estructurados y fieles al texto. Responde en español.",
      prompt: `Idioma que se estudia: ${targetLanguage}. Nivel del estudiante: ${level}.\n\nAnaliza esta guía y extrae sus temas:\n\n${text.slice(0, MAX_PROMPT_CHARS)}`,
    });

    await connectDB();
    const user = await getOrCreateUser(userId, { level, targetLanguage });

    const guide = await StudyGuide.create({
      userId: user._id,
      fileName: file.name,
      title: object.title,
      summary: object.summary,
      topics: object.topics,
      pageCount: parsed.numpages,
      content: text.slice(0, MAX_STORED_CHARS),
    });

    return NextResponse.json({
      id: guide._id.toString(),
      title: guide.title,
      summary: guide.summary,
      topics: guide.topics,
      pageCount: guide.pageCount,
    });
  } catch (err) {
    console.error("[guides/upload]", err);
    return NextResponse.json({ error: "Error al procesar la guía" }, { status: 500 });
  }
}
