import type { LangProgress, MediaStat, Progress, WordStat } from "@/lib/progress";

const emptyLang = (): LangProgress => ({ xp: 0, completed: {}, words: {}, media: {}, games: {} });

/** Rellena campos que falten (los datos del servidor podrían venir incompletos). */
function norm(l: Partial<LangProgress> | undefined): LangProgress {
  return { ...emptyLang(), ...l, games: { ...(l?.games ?? {}) } };
}

function pickNewer<T extends object>(a: T | undefined, b: T | undefined, stamp: keyof T): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return Number(b[stamp] ?? 0) > Number(a[stamp] ?? 0) ? b : a;
}

function mergeLang(a: LangProgress, b: LangProgress): LangProgress {
  const completed: Record<string, number> = { ...a.completed };
  for (const [k, stars] of Object.entries(b.completed)) completed[k] = Math.max(stars, completed[k] ?? 0);

  const words: Record<string, WordStat> = { ...a.words };
  for (const [k, w] of Object.entries(b.words)) words[k] = pickNewer(words[k], w, "lastSeen")!;

  const media: Record<string, MediaStat> = { ...a.media };
  for (const [k, m] of Object.entries(b.media)) {
    const newer = pickNewer(media[k], m, "lastPlayed")!;
    media[k] = {
      ...newer,
      reps: Math.max(media[k]?.reps ?? 0, m.reps),
      best: Math.max(media[k]?.best ?? 0, m.best),
    };
  }

  const pairs = [a.games.pairsBest, b.games.pairsBest].filter((n): n is number => n !== undefined);
  const rush = [a.games.rushBest, b.games.rushBest].filter((n): n is number => n !== undefined);

  // XP por día: el mayor de cada día (sumar contaría dos veces lo ya sincronizado).
  const daily: Record<string, number> = { ...(a.daily ?? {}) };
  for (const [d, xp] of Object.entries(b.daily ?? {})) daily[d] = Math.max(xp, daily[d] ?? 0);

  // Ejercicios: el registro con más respuestas (es el más completo).
  const exercises: Record<string, { ok: number; total: number }> = { ...(a.exercises ?? {}) };
  for (const [k, e] of Object.entries(b.exercises ?? {})) {
    if (!exercises[k] || e.total > exercises[k].total) exercises[k] = e;
  }

  const placement = pickNewer(a.placement, b.placement, "date");

  return {
    xp: Math.max(a.xp, b.xp),
    completed,
    words,
    media,
    games: {
      ...(pairs.length ? { pairsBest: Math.min(...pairs) } : {}),
      ...(rush.length ? { rushBest: Math.max(...rush) } : {}),
    },
    ...(Object.keys(daily).length ? { daily } : {}),
    ...(Object.keys(exercises).length ? { exercises } : {}),
    ...(placement ? { placement } : {}),
  };
}

/**
 * Une dos progresos (p. ej. el del navegador y el del servidor) sin perder logros:
 * XP y puntuaciones toman el máximo, las lecciones la mejor nota y las palabras el
 * registro más reciente. La racha y la meta de hoy salen del día de estudio más reciente.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const langs: Record<string, LangProgress> = {};
  for (const name of new Set([...Object.keys(a.langs ?? {}), ...Object.keys(b.langs ?? {})])) {
    langs[name] = mergeLang(norm(a.langs?.[name]), norm(b.langs?.[name]));
  }

  const aDay = a.lastDay ?? "";
  const bDay = b.lastDay ?? "";
  const latest = aDay === bDay ? null : aDay > bDay ? a : b;
  return {
    langs,
    lastDay: aDay > bDay ? aDay : bDay,
    streak: latest ? latest.streak : Math.max(a.streak ?? 0, b.streak ?? 0),
    todayXp: latest ? latest.todayXp : Math.max(a.todayXp ?? 0, b.todayXp ?? 0),
  };
}
