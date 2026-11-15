import { Schema, model, models, type Model } from "mongoose";

interface Turn {
  question: string;
  answer: string;
  provider: string;
  model: string;
  /** Solo se guarda SI hubo archivos adjuntos; el contenido de los archivos nunca se guarda. */
  hadFiles: boolean;
  at: Date;
}

interface ConversationDoc {
  owner: string;
  /** Identificador de la conversación generado por el navegador. */
  conversationId: string;
  mode: "chat" | "conversation";
  language: string;
  level: string;
  turns: Turn[];
}

/**
 * Preguntas y respuestas de cuentas que dieron permiso (`User.consent.shareData`).
 * Se usan para evaluar y mejorar las respuestas. Se borran si la persona retira el permiso.
 */
const TurnSchema = new Schema<Turn>(
  {
    question: { type: String, maxlength: 2000 },
    answer: { type: String, maxlength: 6000 },
    provider: String,
    model: String,
    hadFiles: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConversationSchema = new Schema<ConversationDoc>(
  {
    owner: { type: String, required: true, index: true },
    conversationId: { type: String, required: true },
    mode: { type: String, enum: ["chat", "conversation"], default: "chat" },
    language: { type: String, default: "" },
    level: { type: String, default: "" },
    turns: { type: [TurnSchema], default: [] },
  },
  { timestamps: true }
);
ConversationSchema.index({ owner: 1, conversationId: 1 }, { unique: true });

export const MAX_TURNS = 200;

export const Conversation: Model<ConversationDoc> =
  (models.Conversation as Model<ConversationDoc>) ||
  model<ConversationDoc>("Conversation", ConversationSchema);
