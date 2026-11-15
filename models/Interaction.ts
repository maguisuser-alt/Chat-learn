import { Schema, model, models, type Model } from "mongoose";

export const INTERACTION_KINDS = [
  "chat",
  "conversation",
  "image",
  "audio",
  "research",
  "language",
  "pronunciation",
  "study",
  "other",
] as const;

interface InteractionDoc {
  /** Email de la cuenta, o "" si se usó sin cuenta. */
  owner: string;
  kind: (typeof INTERACTION_KINDS)[number];
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  /** Intentos hasta responder (modelos/proveedores probados). */
  attempts: number;
  /** Motivo del fallo, recortado. Nunca contiene lo que escribió la persona. */
  error?: string;
  /** Datos de contexto sin contenido personal: tiene archivos, nº de fuentes, etc. */
  meta?: Record<string, string | number | boolean>;
}

/**
 * Registro de uso del sistema SIN contenido de conversaciones. Sirve para saber
 * qué proveedor y modelo fallan, cuáles son más rápidos y qué se usa más.
 * Se borra solo a los 180 días.
 */
const InteractionSchema = new Schema<InteractionDoc>(
  {
    owner: { type: String, default: "", index: true },
    kind: { type: String, enum: INTERACTION_KINDS, required: true, index: true },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    ok: { type: Boolean, required: true },
    latencyMs: { type: Number, default: 0 },
    attempts: { type: Number, default: 1 },
    error: { type: String, maxlength: 300 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
InteractionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });
InteractionSchema.index({ provider: 1, model: 1, ok: 1 });

export const Interaction: Model<InteractionDoc> =
  (models.Interaction as Model<InteractionDoc>) ||
  model<InteractionDoc>("Interaction", InteractionSchema);
