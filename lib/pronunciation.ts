export type WordStatus = "ok" | "mejorable" | "mal" | "omitida";

/**
 * La IA a veces puntúa bien la pronunciación aunque se haya dicho otra frase o
 * faltara media frase. La nota no puede superar la parte de la frase que se dijo
 * (+10 de margen): todo omitido → máximo 10.
 */
export function capScore(score: number, words: { status: WordStatus }[] | undefined): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  if (!words?.length) return clamped;
  const said = words.filter((w) => w.status !== "omitida").length / words.length;
  return Math.min(clamped, Math.round(said * 100) + 10);
}
