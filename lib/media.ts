import { generateText } from "ai";
import { candidateModels } from "@/lib/ai";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeneratedMedia {
  /** Data URL listo para mostrar en el navegador. */
  url: string;
  mediaType: string;
  /** Servicio que lo generó. */
  source: string;
}

// La generación de imágenes de Gemini no tiene cuota gratuita: tras un 429 se
// deja de intentar durante un rato y se usa directamente el servicio gratuito.
const COOLDOWN_MS = 30 * 60_000;
const state = globalThis as typeof globalThis & { _geminiImageOffUntil?: number };

function list(env: string | undefined, fallback: string[]) {
  const items = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

async function geminiImage(prompt: string, key: string): Promise<GeneratedMedia | null> {
  if (process.env.GOOGLE_IMAGE === "off" || Date.now() < (state._geminiImageOffUntil ?? 0)) return null;
  for (const model of list(process.env.GOOGLE_IMAGE_MODEL, ["gemini-3.1-flash-image", "gemini-2.5-flash-image"])) {
    const r = await fetch(`${GEMINI}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!r) continue;
    if (r.status === 429) {
      state._geminiImageOffUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
    if (!r.ok) continue;
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
    };
    const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (img) return { url: `data:${img.mimeType};base64,${img.data}`, mediaType: img.mimeType, source: `Gemini (${model})` };
  }
  return null;
}

/** Reescribe la petición como prompt en inglés, que da mejores resultados en Pollinations. */
async function englishPrompt(prompt: string) {
  for (const c of candidateModels().slice(0, 2)) {
    try {
      const { text } = await generateText({
        model: c.model,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(8_000),
        system:
          "Convert the user's request into a single concise English prompt for an image generator (max 60 words). Describe subject, style and setting. Reply with the prompt only.",
        prompt,
      });
      if (text.trim()) return text.trim().slice(0, 400);
    } catch {
      /* se prueba el siguiente o se usa el texto original */
    }
  }
  return prompt.slice(0, 400);
}

async function pollinationsImage(prompt: string): Promise<GeneratedMedia> {
  const en = await englishPrompt(prompt);
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(en)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !type.startsWith("image/")) {
    throw new Error(`El servicio de imágenes respondió ${r.status}. Inténtalo de nuevo en unos segundos.`);
  }
  const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  return { url: `data:${type};base64,${b64}`, mediaType: type, source: "Pollinations (Flux)" };
}

/** Genera una imagen: Gemini si la cuenta lo permite y, si no, Pollinations (gratis). */
export async function generateImage(prompt: string): Promise<GeneratedMedia> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (key) {
    const img = await geminiImage(prompt, key);
    if (img) return img;
  }
  return pollinationsImage(prompt);
}

export const IMAGE_EDIT_QUOTA_MSG =
  "La edición con IA usa los modelos de imagen de Gemini, que no tienen cuota gratuita en tu clave. Activa la facturación en Google AI Studio o usa las herramientas manuales del editor.";

/**
 * Edita una imagen siguiendo una instrucción en lenguaje natural (Gemini).
 * `dataUrl` es la imagen original como data URL (png, jpeg o webp).
 */
export async function editImage(dataUrl: string, instruction: string): Promise<GeneratedMedia> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("Para editar imágenes con IA hace falta GOOGLE_GENERATIVE_AI_API_KEY en .env.local");
  if (process.env.GOOGLE_IMAGE === "off" || Date.now() < (state._geminiImageOffUntil ?? 0)) {
    throw new Error(IMAGE_EDIT_QUOTA_MSG);
  }
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Formato de imagen no válido");
  const [, mimeType, data] = m;

  let lastError = "";
  for (const model of list(process.env.GOOGLE_IMAGE_MODEL, ["gemini-3.1-flash-image", "gemini-2.5-flash-image"])) {
    const r = await fetch(`${GEMINI}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data } },
              { text: `Edita esta imagen. Cambia solo lo que se pide y conserva el resto. Instrucción: ${instruction}` },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((e: Error) => {
      lastError = e.message;
      return null;
    });
    if (!r) continue;
    if (r.status === 429) {
      state._geminiImageOffUntil = Date.now() + COOLDOWN_MS;
      throw new Error(IMAGE_EDIT_QUOTA_MSG);
    }
    const j = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
    };
    if (!r.ok) {
      lastError = j.error?.message ?? `HTTP ${r.status}`;
      continue;
    }
    const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (img) return { url: `data:${img.mimeType};base64,${img.data}`, mediaType: img.mimeType, source: `Gemini (${model})` };
    lastError = "El modelo no devolvió ninguna imagen. Prueba con otra instrucción.";
  }
  throw new Error(lastError || "No se pudo editar la imagen");
}

/** Envuelve PCM de 16 bits en un WAV (algunos modelos TTS devuelven audio/L16). */
function pcmToWav(pcm: Buffer, rate = 24_000, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const VOICES = ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda"] as const;

/** Convierte texto en voz con los modelos TTS de Gemini (incluidos en el nivel gratuito). */
export async function generateSpeech(text: string, voice: string = "Kore"): Promise<GeneratedMedia> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("Para crear audio hace falta GOOGLE_GENERATIVE_AI_API_KEY en .env.local");
  let lastError = "";
  for (const model of list(process.env.GOOGLE_TTS_MODEL, ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"])) {
    const r = await fetch(`${GEMINI}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text.slice(0, 2_000) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e: Error) => {
      lastError = e.message;
      return null;
    });
    if (!r) continue;
    const j = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
    };
    if (!r.ok) {
      lastError = j.error?.message ?? `HTTP ${r.status}`;
      continue;
    }
    const audio = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!audio) continue;
    if (/wav/i.test(audio.mimeType)) {
      return { url: `data:audio/wav;base64,${audio.data}`, mediaType: "audio/wav", source: `Gemini TTS (${model})` };
    }
    // audio/L16 (PCM crudo): se lee la frecuencia de muestreo del tipo MIME.
    const rate = Number(/rate=(\d+)/i.exec(audio.mimeType)?.[1] ?? 24_000);
    const wav = pcmToWav(Buffer.from(audio.data, "base64"), rate);
    return { url: `data:audio/wav;base64,${wav.toString("base64")}`, mediaType: "audio/wav", source: `Gemini TTS (${model})` };
  }
  throw new Error(lastError || "No se pudo generar el audio");
}
