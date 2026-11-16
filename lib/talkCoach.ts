/** Corrección de un turno hablado de la charla. */
export interface TurnFeedback {
  mode: "audio" | "text";
  heard: string;
  better: string;
  grammar: string;
  praise: string;
  /** Solo con audio. */
  score?: number;
  fluency?: number;
  words?: { word: string; status: "ok" | "mejorable" | "mal" }[];
  issues?: { word: string; tip: string }[];
}

export interface TalkSummary {
  turns: number;
  /** Media de pronunciación de los turnos con audio (null si no hubo). */
  pronunciation: number | null;
  fluency: number | null;
  /** Turnos con alguna corrección de gramática o expresión. */
  corrected: number;
  /** Palabras que más costaron, de más a menos veces. */
  tricky: { word: string; times: number; tip: string }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, "").trim();

/** ¿La versión natural es distinta de lo que dijo? (sin contar mayúsculas ni puntuación) */
export function needsCorrection(f: TurnFeedback): boolean {
  return !!f.grammar.trim() || (!!f.better.trim() && norm(f.better) !== norm(f.heard));
}

/** Resumen de la sesión para el final de la charla. */
export function summarize(feedback: TurnFeedback[]): TalkSummary {
  const audio = feedback.filter((f) => f.mode === "audio" && typeof f.score === "number");
  const counts = new Map<string, { word: string; times: number; tip: string }>();
  for (const f of feedback) {
    for (const i of f.issues ?? []) {
      const key = norm(i.word);
      if (!key) continue;
      const cur = counts.get(key);
      counts.set(key, { word: cur?.word ?? i.word, times: (cur?.times ?? 0) + 1, tip: i.tip || cur?.tip || "" });
    }
  }
  return {
    turns: feedback.length,
    pronunciation: avg(audio.map((f) => f.score!)),
    fluency: avg(audio.filter((f) => typeof f.fluency === "number").map((f) => f.fluency!)),
    corrected: feedback.filter(needsCorrection).length,
    tricky: [...counts.values()].sort((a, b) => b.times - a.times).slice(0, 5),
  };
}

/** Texto para leer en voz alta: sin la corrección final entre paréntesis (en español). */
export function speakable(text: string): string {
  return text.replace(/\([^)]*\)\s*$/, "").trim();
}
