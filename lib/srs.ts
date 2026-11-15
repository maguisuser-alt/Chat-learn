/**
 * Repaso espaciado (versión simplificada de SM-2, el algoritmo de Anki).
 * Cada acierto en una palabra que tocaba repasar alarga el intervalo; un fallo
 * la devuelve a "aprendiendo" y vuelve a salir en unos minutos.
 */
export interface SrsState {
  /** Aciertos seguidos en repasos que tocaban. */
  reps: number;
  /** Facilidad: cuánto crece el intervalo en cada acierto (1.3 – 3.0). */
  ease: number;
  /** Días hasta el próximo repaso. */
  interval: number;
  /** Momento (ms) del próximo repaso. */
  due: number;
}

export const DAY = 86_400_000;
const RELEARN_MS = 10 * 60_000;
const MIN_EASE = 1.3;
const MAX_EASE = 3;

/** Nuevo estado tras responder una palabra. */
export function schedule(prev: Partial<SrsState> | undefined, correct: boolean, now: number): SrsState {
  const reps = prev?.reps ?? 0;
  const ease = prev?.ease ?? 2.5;
  const interval = prev?.interval ?? 0;
  const due = prev?.due ?? 0;

  if (!correct) {
    return { reps: 0, ease: Math.max(MIN_EASE, ease - 0.2), interval: 0, due: now + RELEARN_MS };
  }
  // Acierto en una palabra que aún no tocaba (se repite varias veces en la misma
  // lección): no adelanta el calendario, así no se "infla" el intervalo.
  if (reps > 0 && now < due) return { reps, ease, interval, due };

  const nextReps = reps + 1;
  const nextInterval = nextReps === 1 ? 1 : nextReps === 2 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
  return {
    reps: nextReps,
    ease: Math.min(MAX_EASE, ease + 0.05),
    interval: nextInterval,
    due: now + nextInterval * DAY,
  };
}

interface WordLike {
  word?: string;
  seen?: number;
  correct?: number;
  wrong?: number;
  lastSeen?: number;
  reps?: number;
  ease?: number;
  interval?: number;
  due?: number;
}

/** ¿Toca repasarla? Las palabras sin calendario (de versiones anteriores) tocan ya. */
export const isDue = (w: WordLike, now: number) => (w.due ?? 0) <= now;

/** Palabras que tocan hoy: primero las más atrasadas y las más difíciles. */
export function dueWords<T extends WordLike>(words: T[], now: number, limit = 12): T[] {
  return words
    .filter((w) => isDue(w, now))
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0) || (a.ease ?? 2.5) - (b.ease ?? 2.5))
    .slice(0, limit);
}

export type Mastery = "nueva" | "aprendiendo" | "consolidada" | "dominada";

export const MASTERY_LABEL: Record<Mastery, string> = {
  nueva: "Nueva",
  aprendiendo: "Aprendiendo",
  consolidada: "Consolidada",
  dominada: "Dominada",
};

/** Estado de dominio según el intervalo de repaso. */
export function mastery(w: WordLike): Mastery {
  if (!w.seen) return "nueva";
  const interval = w.interval ?? 0;
  if (interval >= 21) return "dominada";
  if (interval >= 7) return "consolidada";
  return "aprendiendo";
}

/** Cuántas palabras tocan cada uno de los próximos días (el día 0 incluye las atrasadas). */
export function forecast(words: WordLike[], now: number, days = 7): number[] {
  const out = new Array<number>(days).fill(0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (const w of words) {
    const due = w.due ?? 0;
    const idx = Math.max(0, Math.floor((due - start.getTime()) / DAY));
    if (idx < days) out[idx]++;
  }
  return out;
}

/** Momento del próximo repaso pendiente (o null si no hay palabras). */
export function nextDue(words: WordLike[], now: number): number | null {
  const future = words.map((w) => w.due ?? 0).filter((d) => d > now);
  return future.length ? Math.min(...future) : null;
}
