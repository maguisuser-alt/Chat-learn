export interface GuideSummaryDTO {
  id: string;
  title: string;
  summary: string;
  pageCount?: number;
  topics: { name: string; description: string; keyPoints: string[]; difficulty: string }[];
}

export interface StudyPlanDTO {
  _id: string;
  goal: string;
  level: string;
  days: {
    day: number;
    focus: string;
    objectives: string[];
    review: string;
    completed: boolean;
    activities: { type: string; title: string; description: string; minutes: number }[];
  }[];
}

export interface VideoDTO {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

/** Mensaje del chat: además de texto y fuentes, puede traer una parte `data-videos`. */
export type ChatUIMessage = import("ai").UIMessage<
  never,
  {
    videos: { query: string; searchUrl: string; items: VideoDTO[] };
    /** Modelo que generó la respuesta (para valorarla). */
    meta: { provider: string; model: string };
    /** Dato que la IA decidió recordar sobre el usuario. */
    memory: { text: string };
    /** Progreso de la investigación profunda. */
    research: ResearchProgress;
  }
>;

export interface ResearchProgress {
  status: "planning" | "searching" | "writing" | "done" | "error";
  queries: { text: string; done: boolean; found: number }[];
  sources: number;
}
