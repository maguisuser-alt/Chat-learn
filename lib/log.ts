import { auth } from "@/auth";
import { authEnabled } from "@/auth.config";
import { connectDB, isDbConfigured } from "@/lib/mongodb";
import { Conversation, MAX_TURNS } from "@/models/Conversation";
import { Interaction, INTERACTION_KINDS } from "@/models/Interaction";
import { User } from "@/models/User";

/**
 * Cuenta que hace la petición: su email con login activo, o "" sin cuenta.
 * Hay que LLAMARLA dentro de la petición (lee las cookies) y esperar después.
 */
export async function currentOwner(): Promise<string> {
  if (!authEnabled) return "";
  try {
    return (await auth())?.user?.id ?? "";
  } catch {
    return "";
  }
}

/** Ejecuta en segundo plano sin bloquear la respuesta; los errores se descartan. */
function background(task: () => Promise<unknown>) {
  if (!isDbConfigured()) return;
  void (async () => {
    try {
      await task();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[log] no se pudo guardar:", err instanceof Error ? err.message : err);
      }
    }
  })();
}

export interface InteractionEntry {
  /** Cuenta ya resuelta con `currentOwner()` (se pasa para no leer cookies fuera de la petición). */
  owner: string | Promise<string>;
  kind: (typeof INTERACTION_KINDS)[number];
  provider?: string;
  model?: string;
  ok: boolean;
  latencyMs: number;
  attempts?: number;
  error?: string;
  meta?: Record<string, string | number | boolean>;
}

/** Quita de un mensaje de error cualquier dato incrustado (archivos en base64) y lo recorta. */
export function sanitizeError(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  return msg
    .replace(/data:[^\s,]*;base64,[A-Za-z0-9+/=_-]*/g, "[datos]")
    .replace(/[A-Za-z0-9+/=_-]{80,}/g, "[datos]")
    .slice(0, 300);
}

/** Guarda una línea de uso (sin contenido de la conversación). */
export function logInteraction(entry: InteractionEntry) {
  background(async () => {
    const owner = await entry.owner;
    await connectDB();
    await Interaction.create({
      owner,
      kind: entry.kind,
      provider: entry.provider ?? "",
      model: entry.model ?? "",
      ok: entry.ok,
      latencyMs: Math.round(entry.latencyMs),
      attempts: entry.attempts ?? 1,
      error: sanitizeError(entry.error),
      meta: entry.meta,
    });
  });
}

/** ¿La cuenta permitió guardar sus preguntas y respuestas? */
export async function hasShareConsent(owner: string): Promise<boolean> {
  if (!owner) return false;
  await connectDB();
  const user = await User.findOne({ clientId: owner }).select("consent").lean();
  return user?.consent?.shareData === true;
}

export interface TurnEntry {
  owner: string;
  conversationId: string;
  mode: "chat" | "conversation";
  language: string;
  level: string;
  question: string;
  answer: string;
  provider: string;
  model: string;
  hadFiles: boolean;
}

/** Guarda un turno de conversación, solo si la cuenta lo permitió. */
export function saveTurnIfConsented(t: TurnEntry) {
  if (!t.owner || !t.conversationId) return;
  background(async () => {
    if (!(await hasShareConsent(t.owner))) return;
    await Conversation.findOneAndUpdate(
      { owner: t.owner, conversationId: t.conversationId },
      {
        $setOnInsert: { mode: t.mode, language: t.language, level: t.level },
        $push: {
          turns: {
            $each: [
              {
                question: t.question.slice(0, 2000),
                answer: t.answer.slice(0, 6000),
                provider: t.provider,
                model: t.model,
                hadFiles: t.hadFiles,
                at: new Date(),
              },
            ],
            $slice: -MAX_TURNS,
          },
        },
      },
      { upsert: true }
    );
  });
}
