import { LEVELS, type Level } from "@/lib/schemas";

export interface PlacementQuestion {
  level: Level;
  skill: string;
  prompt: string;
  text: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface PlacementAnswer {
  level: Level;
  correct: boolean;
}

export interface PlacementResult {
  level: Level;
  correct: number;
  total: number;
  byLevel: { level: Level; ok: number; total: number }[];
}

/** Para superar un nivel hay que acertar al menos 2 de cada 3 preguntas. */
const PASS_RATE = 2 / 3;

/**
 * Nivel MCER según las respuestas: el último nivel superado de forma
 * consecutiva desde A1. Un nivel suspendido corta la subida.
 */
export function placementLevel(answers: PlacementAnswer[]): PlacementResult {
  const byLevel = LEVELS.map((level) => {
    const list = answers.filter((a) => a.level === level);
    return { level, ok: list.filter((a) => a.correct).length, total: list.length };
  });
  let level: Level = "A1";
  for (const l of byLevel) {
    if (l.total === 0) continue;
    if (l.ok / l.total >= PASS_RATE - 1e-9) level = l.level;
    else break;
  }
  return {
    level,
    correct: answers.filter((a) => a.correct).length,
    total: answers.length,
    byLevel,
  };
}

/** Descarta preguntas mal formadas y deja como mucho `perLevel` por nivel, de más fácil a más difícil. */
export function cleanQuestions(questions: PlacementQuestion[], perLevel = 3): PlacementQuestion[] {
  const valid = questions.filter((q) => {
    const opts = q.options.map((o) => o.trim().toLowerCase());
    return (
      LEVELS.includes(q.level) &&
      q.options.length === 4 &&
      new Set(opts).size === 4 &&
      opts.every(Boolean) &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < 4
    );
  });
  return LEVELS.flatMap((l) => valid.filter((q) => q.level === l).slice(0, perLevel));
}
