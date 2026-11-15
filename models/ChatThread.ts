import { Schema, model, models, type Model } from "mongoose";

/**
 * Un chat del historial de un usuario (uno por documento: así cada chat se
 * sube y baja por separado y nunca se acerca al límite de 16 MB de MongoDB).
 * Los chats borrados quedan como "lápida" (`deleted`) para que el borrado
 * llegue también a los demás dispositivos.
 */
interface ChatThreadDoc {
  owner: string;
  chatId: string;
  title: string;
  gemId: string | null;
  /** Mensajes como JSON ("" si está borrado). */
  messages: string;
  /** Momento (ms, reloj del cliente) del último cambio: gana el más reciente. */
  changedAt: number;
  deleted: boolean;
}

const ChatThreadSchema = new Schema<ChatThreadDoc>(
  {
    owner: { type: String, required: true },
    chatId: { type: String, required: true },
    title: { type: String, default: "Nuevo chat" },
    gemId: { type: String, default: null },
    messages: { type: String, default: "" },
    changedAt: { type: Number, required: true },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChatThreadSchema.index({ owner: 1, chatId: 1 }, { unique: true });
ChatThreadSchema.index({ owner: 1, changedAt: -1 });

export const ChatThread: Model<ChatThreadDoc> =
  (models.ChatThread as Model<ChatThreadDoc>) || model<ChatThreadDoc>("ChatThread", ChatThreadSchema);
