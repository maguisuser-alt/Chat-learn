import { Schema, model, models, type Model } from "mongoose";

interface UserProgressDoc {
  /** Email de Google del dueño (mismo valor que `User.clientId`). */
  owner: string;
  /**
   * Progreso completo (XP, racha, lecciones, palabras, series y juegos) como
   * texto JSON. Las palabras se usan como claves de objeto y pueden contener
   * puntos (p. ej. "Mr."), que MongoDB no admite bien en nombres de campo.
   */
  data: string;
}

const UserProgressSchema = new Schema<UserProgressDoc>(
  {
    owner: { type: String, required: true, unique: true, index: true },
    data: { type: String, required: true },
  },
  { timestamps: true }
);

export const UserProgress: Model<UserProgressDoc> =
  (models.UserProgress as Model<UserProgressDoc>) ||
  model<UserProgressDoc>("UserProgress", UserProgressSchema);
