import { generateObject } from "ai";
import { z } from "zod";
import { runWithFallback } from "@/lib/ai";
import { searchVideos, type VideoResult } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  provider: z.string().optional(),
});

const researchSchema = z.object({
  overview: z
    .string()
    .describe("Respuesta directa y explicación del tema, 150-250 palabras, en Markdown simple"),
  keyPoints: z.array(z.string()).min(3).max(8).describe("Ideas clave para recordar"),
  examples: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .min(1)
    .max(5)
    .describe("Ejemplos, casos o aplicaciones concretas del tema"),
  videoQueries: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe("Búsquedas de YouTube para encontrar clases o explicaciones de este tema"),
  nextSteps: z.array(z.string()).max(4).describe("Qué estudiar después para profundizar"),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const { topic, provider } = parsed.data;

  try {
    const { object, used } = await runWithFallback(provider, async (model, id, abortSignal) => ({
      object: (
        await generateObject({
          model,
          maxRetries: 1,
          abortSignal,
          schema: researchSchema,
          system:
            "Eres un investigador y profesor. Respondes consultas de cualquier materia con precisión, claridad y ejemplos. No inventes datos. Responde en el idioma de la consulta (por defecto, español).",
          prompt: `Consulta o tema a investigar: ${topic}\n\nResponde la consulta, explica el tema, da ideas clave y ejemplos, y propone búsquedas de YouTube útiles para estudiarlo.`,
        })
      ).object,
      used: id,
    }), "research");

    const results = await Promise.all(object.videoQueries.map((q) => searchVideos(q)));
    const seen = new Set<string>();
    const videos: VideoResult[] = [];
    for (const v of results.flat()) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        videos.push(v);
      }
    }

    return Response.json({
      ...object,
      videos: videos.slice(0, 6),
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        object.videoQueries[0]
      )}`,
      provider: used,
    });
  } catch (err) {
    console.error("[research]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al investigar el tema" },
      { status: 500 }
    );
  }
}
