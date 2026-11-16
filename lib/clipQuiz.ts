import { normalize } from "@/lib/similarity";

/** Tipo de ejercicio en cada parada del vídeo. */
export type StopKind = "meaning" | "gap" | "speak";

/** Una parada: el vídeo se detiene justo después de que se dice `quote`. */
export interface ClipStop {
  kind: StopKind;
  /** Segundo en que empieza la frase (para repetir el fragmento). */
  start: number;
  /** Segundo en que se pausa el vídeo (al terminar la frase). */
  time: number;
  /** Frase tal como se oye, en el idioma de estudio. */
  quote: string;
  translation: string;
  /** meaning: expresión de la frase cuyo significado se pregunta. */
  expression?: string;
  /** meaning: 3 opciones en español; una correcta. */
  options?: string[];
  answer?: number;
  /** gap: palabras de `quote` que se ocultan. */
  hidden?: string[];
  tip: string;
}

export interface ClipQuiz {
  summary: string;
  stops: ClipStop[];
}

/** Vídeos más largos no se analizan (lentitud y cuota de la IA). */
export const MAX_CLIP_SECONDS = 12 * 60;

const MIN_GAP_BETWEEN_STOPS = 4;

/** Palabras de la frase, conservando la puntuación para mostrarla. */
export function tokenize(quote: string): string[] {
  return quote.split(/\s+/).filter(Boolean);
}

/**
 * Índices de los tokens que se ocultan en el ejercicio de huecos. Cada palabra
 * oculta se busca una vez en la frase (sin tildes, mayúsculas ni puntuación).
 */
export function gapIndexes(quote: string, hidden: string[]): number[] {
  const tokens = tokenize(quote).map((t) => normalize(t));
  const used = new Set<number>();
  for (const h of hidden) {
    const target = normalize(h);
    if (!target || target.includes(" ")) continue;
    const i = tokens.findIndex((t, j) => t === target && !used.has(j));
    if (i >= 0) used.add(i);
  }
  return [...used].sort((a, b) => a - b);
}

/** ¿La palabra escrita coincide con la oculta? Admite una errata en palabras largas. */
export function gapCorrect(typed: string, expected: string): boolean {
  const a = normalize(typed);
  const b = normalize(expected);
  if (!a) return false;
  if (a === b) return true;
  if (b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // Una sola letra distinta, de más o de menos.
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Limpia las paradas que propone la IA: tiempos válidos y en orden, separadas
 * entre sí, y ejercicios bien formados. Un ejercicio inválido se convierte en
 * «repite la frase» (siempre es posible) en vez de descartarse.
 */
export function cleanStops(raw: ClipStop[], duration?: number, max = 6): ClipStop[] {
  const limit = duration && duration > 0 ? duration : Infinity;
  const out: ClipStop[] = [];
  for (const s of [...raw].sort((a, b) => a.time - b.time)) {
    const quote = s.quote?.trim();
    if (!quote || !Number.isFinite(s.time) || s.time <= 0 || s.time > limit + 1) continue;
    const time = Math.round(s.time * 10) / 10;
    let start = Number.isFinite(s.start) ? Math.max(0, Math.min(s.start, time - 0.5)) : time - 6;
    // Una frase no dura más de ~20 s: si el inicio está muy lejos, se acota.
    start = Math.max(0, time - 20, Math.round(start * 10) / 10);
    const prev = out[out.length - 1];
    if (prev && time - prev.time < MIN_GAP_BETWEEN_STOPS) continue;

    const base = { start, time, quote, translation: s.translation?.trim() ?? "", tip: s.tip?.trim() ?? "" };
    if (s.kind === "meaning") {
      const opts = (s.options ?? []).map((o) => o.trim());
      const ok =
        !!s.expression?.trim() &&
        opts.length === 3 &&
        new Set(opts.map((o) => o.toLowerCase())).size === 3 &&
        opts.every(Boolean) &&
        Number.isInteger(s.answer) &&
        s.answer! >= 0 &&
        s.answer! < 3;
      out.push(ok ? { ...base, kind: "meaning", expression: s.expression!.trim(), options: opts, answer: s.answer } : { ...base, kind: "speak" });
    } else if (s.kind === "gap") {
      const idx = gapIndexes(quote, s.hidden ?? []);
      const tokens = tokenize(quote);
      // Al menos una palabra oculta y que quede contexto visible.
      const ok = idx.length > 0 && idx.length <= Math.max(1, Math.floor(tokens.length / 2));
      out.push(ok ? { ...base, kind: "gap", hidden: idx.map((i) => tokens[i]) } : { ...base, kind: "speak" });
    } else {
      out.push({ ...base, kind: "speak" });
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * ¿Hay que pausar en `stopTime`? Solo al cruzarlo reproduciendo normalmente
 * (no tras un salto con la barra, que sería molesto).
 */
export function crossed(prev: number, now: number, stopTime: number): boolean {
  return prev < stopTime && now >= stopTime && now - prev < 2.5;
}
