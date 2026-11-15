import { generateObject } from "ai";
import { z } from "zod";
import { friendlyAIError, runWithFallback } from "@/lib/ai";
import { LEVELS } from "@/lib/schemas";
import { searchVideos } from "@/lib/youtube";
import { cleanQuestions } from "@/lib/placement";

export const runtime = "nodejs";
export const maxDuration = 120;

const base = {
  language: z.string().min(2).max(40).default("Inglés"),
  level: z.enum(LEVELS).default("A1"),
  provider: z.string().optional(),
};

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("lesson"),
    topic: z.string().min(2).max(200),
    lesson: z.number().int().min(1).max(10).default(1),
    exclude: z.array(z.string().max(80)).max(150).default([]),
    ...base,
  }),
  z.object({ action: z.literal("placement"), ...base }),
  z.object({
    action: z.literal("media"),
    title: z.string().trim().min(2).max(120),
    episode: z.string().trim().max(60).optional(),
    ...base,
  }),
]);

const wordSchema = z.object({
  word: z.string().describe("Palabra o expresión corta en el idioma de estudio"),
  translation: z.string().describe("Traducción breve al español"),
  example: z.string().describe("Frase de ejemplo corta y natural en el idioma de estudio que use la palabra"),
  exampleTranslation: z.string().describe("Traducción al español de la frase de ejemplo"),
  emoji: z.string().describe("Un solo emoji que represente la palabra"),
});

const lessonSchema = z.object({ words: z.array(wordSchema).min(6).max(10) });

const placementSchema = z.object({
  questions: z
    .array(
      z.object({
        level: z.enum(LEVELS).describe("Nivel MCER que mide la pregunta"),
        skill: z.enum(["vocabulario", "gramática", "comprensión"]),
        prompt: z.string().describe("Instrucción corta en español, p. ej. «Elige la palabra que completa la frase»"),
        text: z.string().describe("Frase o texto breve en el idioma de estudio; usa ___ para el hueco si lo hay"),
        options: z.array(z.string()).length(4).describe("4 opciones distintas; solo una correcta"),
        answer: z.number().int().min(0).max(3).describe("Índice (0-3) de la opción correcta"),
        explanation: z.string().describe("Por qué es la correcta, en español, una frase"),
      })
    )
    .min(18)
    .max(26),
});

const mediaSchema = z.object({
  title: z.string().describe("Título oficial de la serie o película y, si aplica, el capítulo"),
  summary: z.string().describe("Resumen en español del capítulo o película, 2-3 frases, sin spoilers graves"),
  lines: z
    .array(
      z.object({
        text: z.string().describe("Frase en el idioma de estudio para repetir en voz alta"),
        translation: z.string().describe("Traducción al español"),
        context: z.string().describe("Quién la diría y en qué situación, en español, breve"),
        tip: z.string().describe("Consejo de pronunciación o de uso, en español, breve"),
      })
    )
    .min(6)
    .max(10),
  vocabulary: z.array(wordSchema).min(5).max(10),
  videoQuery: z
    .string()
    .describe("Búsqueda de YouTube para encontrar escenas o clips de este capítulo en el idioma de estudio"),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    if (data.action === "lesson") {
      const { object } = await runWithFallback(data.provider, (model, _id, abortSignal) =>
        generateObject({
          model,
          maxRetries: 1,
          abortSignal,
          schema: lessonSchema,
          system:
            "Eres un diseñador de cursos de idiomas al estilo Duolingo. Eliges vocabulario útil y frecuente, adecuado al nivel MCER. Las traducciones deben ser distintas entre sí para que los ejercicios de opción múltiple no sean ambiguos.",
          prompt: `Idioma de estudio: ${data.language}. Nivel: ${data.level}.
Tema de la unidad: ${data.topic}. Lección ${data.lesson} de la unidad (las primeras lecciones son más básicas).
Crea 8 palabras o expresiones cortas del tema, con traducción al español, una frase de ejemplo corta y un emoji.${
            data.exclude.length
              ? `\nNo repitas estas palabras que el estudiante ya conoce: ${data.exclude.join(", ")}.`
              : ""
          }`,
        }),
        "language"
      );
      return Response.json(object);
    }

    if (data.action === "placement") {
      const { object } = await runWithFallback(
        data.provider,
        (model, _id, abortSignal) =>
          generateObject({
            model,
            maxRetries: 1,
            abortSignal,
            schema: placementSchema,
            system:
              "Eres examinador oficial de idiomas (MCER). Creas preguntas de opción múltiple fiables: una sola respuesta correcta sin ambigüedad, distractores plausibles y dificultad ajustada a cada nivel.",
            prompt: `Crea un test de nivel de ${data.language} para hispanohablantes con exactamente 4 preguntas por cada nivel: A1, A2, B1, B2, C1 y C2 (24 en total), mezclando vocabulario, gramática y comprensión. (Se usarán 3 por nivel; la cuarta es de reserva.)
Las preguntas de A1 deben ser muy básicas y las de C2, exigentes (matices, registro, expresiones idiomáticas).
Revisa que la opción indicada en "answer" sea realmente la única correcta.`,
          }),
        "language",
        45_000
      );
      // Verificación: se resuelve el test por separado y se descartan las preguntas
      // cuya respuesta no coincide con la clave (claves erróneas darían un nivel falso).
      let candidates = cleanQuestions(object.questions, 4);
      const verification = { generated: candidates.length, kept: candidates.length, verified: false };
      try {
        const { object: check } = await runWithFallback(
          data.provider,
          (model, _id, abortSignal) =>
            generateObject({
              model,
              maxRetries: 1,
              abortSignal,
              schema: z.object({ answers: z.array(z.number().int().min(0).max(3)) }),
              system: `Eres un hablante nativo experto en ${data.language}. Resuelves tests con cuidado: para cada pregunta eliges la única opción correcta.`,
              prompt: `Responde cada pregunta con el índice (0-3) de la opción correcta, en el mismo orden.\n\n${candidates
                .map((q, i) => `${i + 1}. ${q.prompt}\n${q.text}\n${q.options.map((o, j) => `${j}) ${o}`).join("\n")}`)
                .join("\n\n")}`,
            }),
          "language",
          45_000
        );
        if (check.answers.length === candidates.length) {
          const agreed = candidates.filter((q, i) => check.answers[i] === q.answer);
          verification.kept = agreed.length;
          verification.verified = true;
          candidates = agreed;
        }
      } catch {
        /* sin verificación se usa el test tal cual */
      }
      const questions = cleanQuestions(candidates, 3);
      if (questions.length < 12) throw new Error("El test generado no es fiable. Inténtalo de nuevo.");
      return Response.json({ questions, verification });
    }

    const { object } = await runWithFallback(data.provider, (model, _id, abortSignal) =>
      generateObject({
        model,
        maxRetries: 1,
        abortSignal,
        schema: mediaSchema,
        system: `Eres un profesor de idiomas que usa series y películas para enseñar. Creas material de práctica de "shadowing" (escuchar y repetir).
Reglas importantes:
- No copies diálogos ni guiones literales: escribe frases ORIGINALES, naturales y cortas, al estilo de los personajes y situaciones de la obra, con el vocabulario y las expresiones típicas del capítulo. Solo puedes incluir alguna frase célebre muy corta (una o dos) si es muy conocida.
- Adapta la dificultad al nivel MCER del estudiante.
- Si no conoces bien el capítulo indicado, basa el material en los personajes y temas generales de la obra y dilo en el resumen.`,
        prompt: `Idioma de estudio: ${data.language}. Nivel: ${data.level}.
Serie o película: ${data.title}${data.episode ? `. Capítulo: ${data.episode}` : ""}.
Genera el resumen, 8 frases para repetir en orden de la trama, el vocabulario clave y una búsqueda de YouTube para ver escenas.`,
      }),
      "language"
    );

    const videos = await searchVideos(object.videoQuery, "en", 4);
    return Response.json({
      ...object,
      videos,
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(object.videoQuery)}`,
    });
  } catch (err) {
    console.error("[language]", err);
    return Response.json({ error: friendlyAIError(err) }, { status: 500 });
  }
}
