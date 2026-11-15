/** Normaliza texto para comparar: minúsculas, sin tildes ni puntuación. */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de edición entre dos cadenas (Levenshtein). */
export function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Compara una respuesta escrita: exacta, casi (una errata) o incorrecta. */
export function checkTyped(answer: string, expected: string): "ok" | "typo" | "wrong" {
  const a = normalize(answer);
  const e = normalize(expected);
  if (!a) return "wrong";
  if (a === e) return "ok";
  return e.length > 4 && levenshtein(a, e) <= 1 ? "typo" : "wrong";
}

/**
 * Compara lo que dijo el usuario (transcripción) con la frase objetivo.
 * Devuelve una puntuación 0-100 y qué palabras de la frase se reconocieron.
 */
export function compareSpeech(target: string, heard: string) {
  const t = normalize(target).split(" ").filter(Boolean);
  const h = normalize(heard).split(" ").filter(Boolean);
  // Subsecuencia común más larga, palabra a palabra.
  const dp = Array.from({ length: t.length + 1 }, () => new Array<number>(h.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      const same = t[i - 1] === h[j - 1] || (t[i - 1].length > 3 && levenshtein(t[i - 1], h[j - 1]) <= 1);
      dp[i][j] = same ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matched = new Array<boolean>(t.length).fill(false);
  let i = t.length;
  let j = h.length;
  while (i > 0 && j > 0) {
    const same = t[i - 1] === h[j - 1] || (t[i - 1].length > 3 && levenshtein(t[i - 1], h[j - 1]) <= 1);
    if (same) {
      matched[i - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const hits = matched.filter(Boolean).length;
  // Penaliza palabras extra dichas que no están en la frase.
  const extra = Math.max(0, h.length - hits);
  const score = t.length ? Math.round((100 * hits) / (t.length + extra * 0.5)) : 0;
  return { score: Math.min(100, score), words: t.map((w, k) => ({ word: w, ok: matched[k] })) };
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
