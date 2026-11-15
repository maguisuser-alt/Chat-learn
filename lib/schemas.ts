import { z } from "zod";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

/** Resumen estructurado de una guía. */
export const guideSummarySchema = z.object({
  title: z.string().describe("Título descriptivo de la guía"),
  summary: z.string().describe("Resumen general de 3 a 5 frases"),
  topics: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        keyPoints: z.array(z.string()).describe("Conceptos o reglas clave"),
        difficulty: z.enum(LEVELS).describe("Nivel MCER estimado del tema"),
      })
    )
    .min(1),
});
export type GuideSummary = z.infer<typeof guideSummarySchema>;

/** Plan de estudio diario. */
export const studyPlanSchema = z.object({
  goal: z.string().describe("Objetivo global del plan"),
  days: z.array(
    z.object({
      day: z.number().int().min(1),
      focus: z.string().describe("Tema principal del día"),
      objectives: z.array(z.string()).min(1),
      activities: z
        .array(
          z.object({
            type: z.enum([
              "reading",
              "vocabulary",
              "grammar",
              "listening",
              "speaking",
              "writing",
              "review",
              "quiz",
            ]),
            title: z.string(),
            description: z.string(),
            minutes: z.number().int().min(5).max(120),
          })
        )
        .min(1),
      review: z.string().describe("Cómo repasar lo aprendido ese día"),
    })
  ),
});
export type StudyPlanOutput = z.infer<typeof studyPlanSchema>;

export const studyPlanRequestSchema = z.object({
  guideId: z.string().min(1),
  userId: z.string().min(1),
  days: z.number().int().min(1).max(30).default(7),
  minutesPerDay: z.number().int().min(10).max(240).default(45),
});
