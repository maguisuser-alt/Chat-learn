import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

const TopicSchema = new Schema(
  {
    name: String,
    description: String,
    keyPoints: [String],
    difficulty: String,
  },
  { _id: false }
);

const StudyGuideSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    topics: [TopicSchema],
    pageCount: Number,
    // Texto completo extraído (se usa como contexto del tutor).
    content: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

export type StudyGuideDoc = InferSchemaType<typeof StudyGuideSchema>;
export const StudyGuide: Model<StudyGuideDoc> =
  (models.StudyGuide as Model<StudyGuideDoc>) ||
  model<StudyGuideDoc>("StudyGuide", StudyGuideSchema);
