import { Schema, model, models, type Model } from "mongoose";

export const USER_DATA_KINDS = ["settings", "decks", "profile"] as const;
export type UserDataKind = (typeof USER_DATA_KINDS)[number];

interface UserDataDoc {
  /** Email de Google del dueño (mismo valor que `User.clientId`). */
  owner: string;
  /** settings: personalización, memoria y asistentes · decks: tarjetas · profile: idioma, nivel e IA. */
  kind: UserDataKind;
  /** Documento completo como JSON (las claves pueden contener puntos, que MongoDB no admite en campos). */
  data: string;
}

const UserDataSchema = new Schema<UserDataDoc>(
  {
    owner: { type: String, required: true },
    kind: { type: String, enum: USER_DATA_KINDS, required: true },
    data: { type: String, required: true },
  },
  { timestamps: true }
);

UserDataSchema.index({ owner: 1, kind: 1 }, { unique: true });

export const UserData: Model<UserDataDoc> =
  (models.UserData as Model<UserDataDoc>) || model<UserDataDoc>("UserData", UserDataSchema);
