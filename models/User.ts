import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    /** Email de Google (o UUID anónimo): clave de identidad única. */
    clientId: { type: String, required: true, unique: true, index: true },
    /** Nombre para mostrar (tomado de Google). */
    name: { type: String, default: "" },
    /** URL del avatar de Google. */
    avatar: { type: String, default: "" },
    level: {
      type: String,
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
      default: "A1",
    },
    targetLanguage: { type: String, default: "Inglés" },
    nativeLanguage: { type: String, default: "Español" },
    /** Permisos de la persona sobre sus datos. Todo desactivado por defecto. */
    consent: {
      /** Permite guardar sus preguntas y respuestas para mejorar la IA. */
      shareData: { type: Boolean, default: false },
      updatedAt: { type: Date },
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;
export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);
