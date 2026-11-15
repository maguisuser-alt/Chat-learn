import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

const ActivitySchema = new Schema(
  { type: String, title: String, description: String, minutes: Number },
  { _id: false }
);

const DaySchema = new Schema(
  {
    day: Number,
    focus: String,
    objectives: [String],
    activities: [ActivitySchema],
    review: String,
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const StudyPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    guideId: { type: Schema.Types.ObjectId, ref: "StudyGuide", required: true, index: true },
    level: String,
    goal: String,
    minutesPerDay: Number,
    days: [DaySchema],
  },
  { timestamps: true }
);

export type StudyPlanDoc = InferSchemaType<typeof StudyPlanSchema>;
export const StudyPlan: Model<StudyPlanDoc> =
  (models.StudyPlan as Model<StudyPlanDoc>) ||
  model<StudyPlanDoc>("StudyPlan", StudyPlanSchema);
