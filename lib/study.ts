import { schedule, type SrsState } from "@/lib/srs";

/** Tarjeta de estudio (pregunta → respuesta) con su calendario de repaso. */
export interface StudyCard extends Partial<SrsState> {
  id: string;
  front: string;
  back: string;
  seen: number;
  correct: number;
  wrong: number;
  lastSeen?: number;
}

export interface Deck {
  id: string;
  title: string;
  createdAt: number;
  /** Chat del que salió el mazo (si aplica). */
  chatId?: string;
  cards: StudyCard[];
  /** Momento del último cambio (para fusionar entre dispositivos). */
  updatedAt?: number;
  /** Ids de tarjetas borradas (para que el borrado llegue a otros dispositivos). */
  removedCards?: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

/** Texto máximo que se envía a la IA para crear tarjetas o exámenes. */
export const MAX_SOURCE_CHARS = 12_000;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Convierte las tarjetas de la IA en tarjetas nuevas (sin repetir anversos) que tocan ya. */
export function newCards(raw: { front: string; back: string }[], now: number, existing: StudyCard[] = []): StudyCard[] {
  const seen = new Set(existing.map((c) => norm(c.front)));
  const out: StudyCard[] = [];
  for (const r of raw) {
    const front = r.front.trim();
    const back = r.back.trim();
    if (!front || !back || seen.has(norm(front))) continue;
    seen.add(norm(front));
    out.push({ id: uid(), front, back, seen: 0, correct: 0, wrong: 0, reps: 0, ease: 2.5, interval: 0, due: now });
  }
  return out;
}

export function createDeck(title: string, raw: { front: string; back: string }[], now: number, chatId?: string): Deck {
  return { id: uid(), title: title.trim() || "Mazo sin título", createdAt: now, updatedAt: now, chatId, cards: newCards(raw, now) };
}

/** Estado de la tarjeta tras responder «la sabía» (correct) o «no la sabía». */
export function reviewCard(card: StudyCard, correct: boolean, now: number): StudyCard {
  return {
    ...card,
    ...schedule(card, correct, now),
    seen: card.seen + 1,
    correct: card.correct + (correct ? 1 : 0),
    wrong: card.wrong + (correct ? 0 : 1),
    lastSeen: now,
  };
}

/** Descarta preguntas mal formadas: 4 opciones distintas y no vacías, índice válido, sin preguntas repetidas. */
export function cleanQuiz(questions: QuizQuestion[]): QuizQuestion[] {
  const asked = new Set<string>();
  return questions.filter((q) => {
    const opts = q.options.map(norm);
    const key = norm(q.question);
    const ok =
      !!key &&
      !asked.has(key) &&
      q.options.length === 4 &&
      new Set(opts).size === 4 &&
      opts.every(Boolean) &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < 4;
    if (ok) asked.add(key);
    return ok;
  });
}

/** Nota sobre 10 con un decimal. */
export function quizGrade(correct: number, total: number): number {
  if (!total) return 0;
  return Math.round((correct / total) * 100) / 10;
}

/** Texto de un mazo para pedir un examen sobre él. */
export function deckAsText(deck: Deck): string {
  return `${deck.title}\n\n${deck.cards.map((c) => `- ${c.front}: ${c.back}`).join("\n")}`.slice(0, MAX_SOURCE_CHARS);
}
