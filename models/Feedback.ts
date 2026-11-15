import { Schema, model, models, type Model } from "mongoose";

export const FEEDBACK_REASONS = ["incorrecta", "incompleta", "confusa", "no_respondio", "otro"] as const;

interface FeedbackDoc {
  owner: string;
  /** Id del mensaje en el navegador. Una valoración por mensaje y cuenta. */
  messageId: string;
  conversationId: string;
  rating: "up" | "down";
  reason?: (typeof FEEDBACK_REASONS)[number];
  provider: string;
  model: string;
  /** Pregunta y respuesta valoradas: solo si la cuenta dio permiso. */
  question?: string;
  answer?: string;
}

/** Pulgares arriba/abajo sobre las respuestas: la señal más directa de calidad. */
const FeedbackSchema = new Schema<FeedbackDoc>(
  {
    owner: { type: String, default: "", index: true },
    messageId: { type: String, required: true },
    conversationId: { type: String, default: "" },
    rating: { type: String, enum: ["up", "down"], required: true },
    reason: { type: String, enum: FEEDBACK_REASONS },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    question: { type: String, maxlength: 2000 },
    answer: { type: String, maxlength: 6000 },
  },
  { timestamps: true }
);
FeedbackSchema.index({ owner: 1, messageId: 1 }, { unique: true });
FeedbackSchema.index({ provider: 1, model: 1, rating: 1 });

export const Feedback: Model<FeedbackDoc> =
  (models.Feedback as Model<FeedbackDoc>) || model<FeedbackDoc>("Feedback", FeedbackSchema);
