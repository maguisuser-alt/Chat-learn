import { generateObject } from "ai";
import { z } from "zod";
import { friendlyAIError, runWithFallback } from "@/lib/ai";
import { LEVELS } from "@/lib/schemas";
import { capScore } from "@/lib/pronunciation";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_B64 = 1_400_000;

const base = {
  language: z.string().min(2).max(40).default("Inglés"),
  level: z.enum(LEVELS).default("A1"),
  provider: z.string().optional(),
};

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("phrases"), topic: z.string().max(200).optional(), ...base }),
  z.object({
    action: z.literal("evaluate"),
    target: z.string().min(1).max(300),
    transcript: z.string().max(300),
    ...base,
  }),
  z.object({
    action: z.literal("evaluateAudio"),
    target: z.string().min(1).max(300),
    /** WAV en base64 (≈ 15 s a 16 kHz mono ocupan unos 650 KB). */
    audio: z.string().min(100).max(MAX_AUDIO_B64),
    /** Lo que entendió el reconocimiento del navegador, si lo hay (pista, no fiable). */
    transcript: z.string().max(300).default(""),
    ...base,
  }),
]);

const phrasesSchema = z.object({
  phrases: z
    .array(
      z.object({
        text: z.string().describe("Frase en el idioma de estudio"),
        translation: z.string().describe("Traducción al español"),
        tip: z.string().describe("Consejo breve de pronunciación en español"),
      })
    )
    .length(5),
});

const evaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string().describe("Una frase de resumen en español"),
  wordIssues: z
    .array(
      z.object({
        word: z.string().describe("Palabra objetivo"),
        heard: z.string().describe("Lo que se entendió o 'omitida'"),
        tip: z.string().describe("Cómo pronunciarla bien, en español, con guía fonética simple"),
      })
    )
    .max(6),
  encouragement: z.string(),
});

const audioEvaluationSchema = evaluationSchema.extend({
  heard: z.string().describe("Transcripción literal de lo que se oye en la grabación (vacía si no se oye voz)"),
  words: z
    .array(
      z.object({
        word: z.string().describe("Palabra de la frase objetivo, en orden"),
        status: z.enum(["ok", "mejorable", "mal", "omitida"]),
      })
    )
    .describe("Todas las palabras de la frase objetivo, en orden, con su valoración"),
  fluency: z.number().int().min(0).max(100).describe("Fluidez y ritmo (pausas, velocidad, enlace entre palabras)"),
  intonation: z.string().describe("Comentario breve sobre entonación y acento de palabra, en español"),
});

const TEXT_SYSTEM =
  "Eres un evaluador de pronunciación. Recibes la frase objetivo y la transcripción que devolvió el reconocimiento de voz del navegador. Compara palabra por palabra: las diferencias sugieren errores de pronunciación. Ten en cuenta que la transcripción puede tener errores propios y que no hay puntuación ni mayúsculas fiables. Sé amable, concreto y responde en español.";

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    if (data.action === "phrases") {
      const { object } = await runWithFallback(data.provider, (model, _id, abortSignal) =>
        generateObject({
          model,
          maxRetries: 1,
          abortSignal,
          schema: phrasesSchema,
          system: "Eres un profesor de pronunciación. Responde en español salvo las frases.",
          prompt: `Crea 5 frases cortas y naturales en ${data.language} para practicar pronunciación, nivel ${data.level}.${
            data.topic ? ` Tema: ${data.topic}.` : ""
          } Incluye sonidos difíciles para un hispanohablante.`,
        }),
        "pronunciation"
      );
      return Response.json(object);
    }

    if (data.action === "evaluateAudio") {
      try {
        // Solo Gemini escucha audio; los demás proveedores no admiten este tipo de entrada.
        const { object } = await runWithFallback(
          data.provider,
          (model, _id, abortSignal) =>
            generateObject({
              model,
              maxRetries: 1,
              abortSignal,
              schema: audioEvaluationSchema,
              system: `Eres un profesor nativo de ${data.language} experto en fonética que evalúa a hispanohablantes. Escuchas la grabación y juzgas la PRONUNCIACIÓN real: sonidos (vocales, consonantes, sonidos que no existen en español), acento de palabra, entonación y fluidez. No juzgues la calidad del micrófono.
Puntuación: 90-100 casi nativo; 75-89 se entiende bien con algún sonido mejorable; 50-74 se entiende con esfuerzo; <50 difícil de entender o frase incompleta. Si la grabación no contiene la frase (silencio, otra frase, ruido), puntúa bajo y dilo en el veredicto.
En wordIssues incluye solo las palabras con problemas, explicando el sonido concreto con una guía fonética sencilla para hispanohablantes. Sé amable y concreto. Responde en español salvo las palabras citadas.`,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Idioma: ${data.language}. Nivel del estudiante: ${data.level}.\nFrase que debía decir: "${data.target}"${
                        data.transcript ? `\n(El reconocedor del navegador entendió: "${data.transcript}"; puede equivocarse.)` : ""
                      }\nEvalúa la grabación adjunta.`,
                    },
                    { type: "file", data: data.audio, mediaType: "audio/wav" },
                  ],
                },
              ],
            }),
          "pronunciation",
          40_000,
          ["google"]
        );
        return Response.json({ ...object, score: capScore(object.score, object.words), mode: "audio" });
      } catch (err) {
        // Sin Gemini (o sin cuota) se evalúa con el texto reconocido, si lo hay.
        if (!data.transcript.trim()) throw err;
        console.warn("[pronunciation] audio no disponible, se evalúa el texto:", err instanceof Error ? err.message.slice(0, 160) : err);
      }
    }

    const { object } = await runWithFallback(data.provider, (model, _id, abortSignal) =>
      generateObject({
        model,
        maxRetries: 1,
        abortSignal,
        schema: evaluationSchema,
        system: TEXT_SYSTEM,
        prompt: `Idioma: ${data.language}. Nivel: ${data.level}.\nFrase objetivo: "${data.target}"\nTranscripción oída: "${data.transcript}"`,
      }),
      "pronunciation"
    );
    return Response.json({ ...object, mode: "text" });
  } catch (err) {
    console.error("[pronunciation]", err);
    return Response.json({ error: friendlyAIError(err) }, { status: 500 });
  }
}
