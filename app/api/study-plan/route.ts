import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/lib/ai";
import { studyPlanSchema, studyPlanRequestSchema } from "@/lib/schemas";
import { User } from "@/models/User";
import { StudyGuide } from "@/models/StudyGuide";
import { StudyPlan } from "@/models/StudyPlan";
import { resolveUserId } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Genera un plan nuevo adaptado al nivel y al progreso previo. */
export async function POST(req: Request) {
  try {
    const parsed = studyPlanRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { guideId, days, minutesPerDay } = parsed.data;
    const userId = await resolveUserId(parsed.data.userId);
    if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
    if (!isValidObjectId(guideId)) {
      return NextResponse.json({ error: "guideId inválido" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ clientId: userId });
    // Se filtra por dueño para que nadie acceda a guías ajenas.
    const guide = user
      ? await StudyGuide.findOne({ _id: guideId, userId: user._id }).select("+content")
      : null;
    if (!user || !guide) {
      return NextResponse.json({ error: "Guía no encontrada" }, { status: 404 });
    }

    // Progreso previo: días completados y temas ya cubiertos en planes anteriores.
    const previous = await StudyPlan.find({ userId: user._id, guideId: guide._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();
    const completed = previous.flatMap((p) => p.days.filter((d) => d.completed));
    const pending = previous[0]?.days.filter((d) => !d.completed) ?? [];

    const progressText = previous.length
      ? `Progreso previo: ${completed.length} días completados. Temas dominados: ${
          completed.map((d) => d.focus).join("; ") || "ninguno"
        }. Temas pendientes del plan anterior: ${
          pending.map((d) => d.focus).join("; ") || "ninguno"
        }. Prioriza lo pendiente y repasa brevemente lo ya visto; no repitas todo.`
      : "Es el primer plan del estudiante: no hay progreso previo.";

    const { object } = await generateObject({
      model: getModel(),
      schema: studyPlanSchema,
      system:
        "Eres un planificador de estudio de idiomas. Creas planes diarios realistas, progresivos y basados SOLO en el contenido de la guía. Redacta en español.",
      prompt: [
        `Idioma de estudio: ${user.targetLanguage}. Nivel actual: ${user.level}.`,
        `Duración: exactamente ${days} días, ~${minutesPerDay} minutos por día (la suma de minutos de actividades de cada día debe aproximarse a ese valor).`,
        progressText,
        `Resumen de la guía: ${guide.summary}`,
        `Temas: ${guide.topics.map((t) => `${t.name} (${t.difficulty})`).join(", ")}`,
        `Contenido:\n${guide.content.slice(0, 40_000)}`,
      ].join("\n\n"),
    });

    const plan = await StudyPlan.create({
      userId: user._id,
      guideId: guide._id,
      level: user.level,
      goal: object.goal,
      minutesPerDay,
      days: object.days.map((d) => ({ ...d, completed: false })),
    });

    return NextResponse.json(plan.toJSON());
  } catch (err) {
    console.error("[study-plan POST]", err);
    return NextResponse.json({ error: "No se pudo generar el plan" }, { status: 500 });
  }
}

/** Devuelve el plan más reciente de una guía. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const guideId = searchParams.get("guideId");
  if (!guideId || !isValidObjectId(guideId)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const userId = await resolveUserId(searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  await connectDB();
  const user = await User.findOne({ clientId: userId });
  if (!user) return NextResponse.json(null);
  const plan = await StudyPlan.findOne({ userId: user._id, guideId }).sort({ createdAt: -1 });
  return NextResponse.json(plan ? plan.toJSON() : null);
}

const patchSchema = z.object({
  planId: z.string(),
  userId: z.string(),
  day: z.number().int().min(1),
  completed: z.boolean(),
});

/** Marca un día como completado: alimenta la adaptación de futuros planes. */
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success || !isValidObjectId(parsed.data.planId)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { planId, day, completed } = parsed.data;
  const userId = await resolveUserId(parsed.data.userId);
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  await connectDB();
  const user = await User.findOne({ clientId: userId });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const plan = await StudyPlan.findOneAndUpdate(
    { _id: planId, userId: user._id, "days.day": day },
    { $set: { "days.$.completed": completed } },
    { new: true }
  );
  if (!plan) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
  return NextResponse.json(plan.toJSON());
}
