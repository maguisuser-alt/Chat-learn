import { generateObject } from "ai";
import { z } from "zod";
import { friendlyAIError, runWithFallback } from "@/lib/ai";
import { LEVELS } from "@/lib/schemas";
import { searchVideos } from "@/lib/youtube";
import { cleanQuestions } from "@/lib/placement";
import { cleanStops, MAX_CLIP_SECONDS, type ClipStop } from "@/lib/clipQuiz";

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
    action: z.literal("clip"),
    videoId: z.string().regex(/^[\w-]{6,20}$/),
    /** Serie o película, para dar contexto a la IA. */
    title: z.string().trim().max(160).default(""),
    duration: z.number().positive().max(MAX_CLIP_SECONDS).optional(),
    ...base,
  }),
  z.object({
    action: z.literal("media"),
    title: z.string().trim().min(2).max(120),
    episode: z.string().trim().max(60).optional(),
    ...base,
  }),
  z.object({
    action: z.literal("song"),
    title: z.string().trim().min(2).max(120),
    artist: z.string().trim().max(80).default(""),
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

const clipSchema = z.object({
  summary: z.string().describe("De qué trata el clip, en español, una o dos frases"),
  spokenLanguage: z.string().describe("Idioma que se habla en el clip, en español (p. ej. «Inglés»)"),
  stops: z
    .array(
      z.object({
        kind: z
          .enum(["meaning", "gap", "speak"])
          .describe("meaning: adivinar el significado de una expresión; gap: completar palabras; speak: repetir la frase"),
        start: z.number().describe("Segundo exacto del clip en que EMPIEZA a decirse la frase"),
        time: z.number().describe("Segundo exacto del clip en que TERMINA de decirse la frase (ahí se pausa)"),
        quote: z.string().describe("La frase EXACTA que se oye, palabra por palabra, en el idioma del clip"),
        translation: z.string().describe("Traducción natural al español"),
        expression: z.string().optional().describe("Solo meaning: la expresión o modismo de la frase"),
        options: z.array(z.string()).optional().describe("Solo meaning: 3 significados en español, uno correcto"),
        answer: z.number().int().optional().describe("Solo meaning: índice (0-2) del significado correcto"),
        hidden: z.array(z.string()).optional().describe("Solo gap: 1-3 palabras sueltas de quote que se ocultan"),
        tip: z.string().describe("Consejo breve en español: uso, pronunciación o contexto"),
      })
    )
    .min(1)
    .max(10),
});

const songSchema = z.object({
  title: z.string().describe("Título oficial de la canción y artista"),
  summary: z.string().describe("De qué trata la canción, en español, 2-3 frases"),
  verses: z
    .array(
      z.object({
        label: z.string().describe("Nombre de la parte de la canción en español: 'Intro', 'Estrofa 1', 'Estribillo', 'Puente', etc."),
        original: z.string().describe("Verso o estribillo corto en el idioma de la canción (1-2 líneas)"),
        translation: z.string().describe("Traducción literal al español"),
        tip: z.string().describe("Qué enseña este fragmento: pronunciación, expresión idiomática o gramática, en español"),
        blanks: z.array(z.string()).min(1).max(3).describe("1-3 palabras clave de este verso que se van a ocultar para el ejercicio"),
      })
    )
    .min(5)
    .max(10)
    .describe("Fragmentos de la canción para practicar, en orden de aparición"),
  vocabulary: z.array(wordSchema).min(5).max(10).describe("Palabras o expresiones clave de la canción"),
  videoQuery: z.string().describe("Búsqueda de YouTube para encontrar el videoclip oficial o una versión con letra"),
  karaokeLine: z.string().describe("El estribillo más pegadizo de la canción, en el idioma original, para mostrarlo en la pantalla final"),
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

    if (data.action === "clip") {
      // Solo Gemini puede ver vídeos de YouTube (los analiza a partir de la URL).
      const { object } = await runWithFallback(
        data.provider,
        (model, _id, abortSignal) =>
          generateObject({
            model,
            maxRetries: 1,
            abortSignal,
            schema: clipSchema,
            providerOptions: { google: { mediaResolution: "MEDIA_RESOLUTION_LOW" } },
            system: `Eres un profesor de ${data.language} que prepara ejercicios sobre clips de series y películas, como en las apps de idiomas con vídeo.
Ves y escuchas el clip completo. Eliges entre 4 y 6 momentos en los que un personaje dice una frase clara y útil para un estudiante de nivel ${data.level}, repartidos a lo largo del clip.
Reglas:
- "quote" debe ser exactamente lo que se oye (no lo inventes ni lo resumas). Si no se entiende bien, elige otra frase.
- "start" y "time" son los segundos reales del clip en que empieza y termina la frase. Sé preciso: el vídeo se pausará en "time".
- Mezcla los tipos: al menos uno de cada (meaning, gap, speak) si el clip lo permite. meaning solo cuando la frase tenga una expresión o modismo.
- Las opciones de meaning: una correcta y dos plausibles pero incorrectas, en español.
- En gap oculta palabras clave sueltas (no artículos) que se oigan con claridad.
- Si el clip no está en ${data.language} o casi no tiene diálogo, indícalo en spokenLanguage y devuelve las frases que haya.`,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Clip${data.title ? ` de «${data.title}»` : ""}. Estudiante hispanohablante, nivel ${data.level} de ${data.language}. Prepara las paradas.`,
                  },
                  { type: "file", data: `https://www.youtube.com/watch?v=${data.videoId}`, mediaType: "video/mp4" },
                ],
              },
            ],
          }),
        "language",
        90_000,
        ["google"]
      );
      const stops = cleanStops(object.stops as ClipStop[], data.duration);
      console.info(`[clip] ${data.videoId}: ${object.stops.length} paradas propuestas, ${stops.length} válidas`);
      if (stops.length < 1) {
        throw new Error("Este clip casi no tiene diálogo que se pueda practicar. Prueba con otro.");
      }
      return Response.json({ summary: object.summary, spokenLanguage: object.spokenLanguage, stops });
    }

    if (data.action === "song") {
      const { object } = await runWithFallback(data.provider, (model, _id, abortSignal) =>
        generateObject({
          model,
          maxRetries: 1,
          abortSignal,
          schema: songSchema,
          system: `Eres un profesor de idiomas que usa canciones para enseñar. Preparas material de práctica de "fill-in-the-blank" (completar huecos escuchando) y shadowing (escuchar y repetir).
Reglas:
- Usa fragmentos REALES de la canción pedida, en el orden en que aparecen (intro, estrofas, estribillo).
- Si no conoces la letra exacta, escribe fragmentos representativos del estilo y la temática de la canción, e indícalo en el summary.
- Los "blanks" son palabras sueltas y clave del fragmento (verbos, sustantivos, adjetivos importantes), no artículos ni preposiciones.
- El tip debe ser útil y concreto: una nota de pronunciación, un modismo, o por qué esa estructura gramatical es importante.
- El vocabulario son palabras o expresiones que aparecen en la canción y son útiles para el nivel del estudiante.`,
          prompt: `Canción: «${data.title}»${data.artist ? ` de ${data.artist}` : ""}.
Idioma de estudio: ${data.language}. Nivel del estudiante: ${data.level}.
Prepara entre 6 y 8 fragmentos de la canción con su etiqueta (Intro, Estrofa 1, Estribillo…), traducción, tip y palabras clave para completar.`,
        }),
        "language"
      );
      const found = await searchVideos(
        object.videoQuery || `${data.title} ${data.artist} official lyrics`,
        "en",
        6
      );
      return Response.json({
        ...object,
        videos: found.slice(0, 4),
        searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(object.videoQuery)}`,
      });
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

    // Primero los clips cortos: son los que se pueden analizar y practicar con paradas.
    const found = await searchVideos(object.videoQuery, "en", 8);
    const fits = (v: { duration?: number }) => !!v.duration && v.duration >= 30 && v.duration <= MAX_CLIP_SECONDS;
    const videos = [...found.filter(fits), ...found.filter((v) => !fits(v))].slice(0, 6);
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
