"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, Mic, MicOff, Volume2, X } from "lucide-react";
import type { Word } from "@/lib/lessons";
import { checkTyped, compareSpeech, shuffle } from "@/lib/similarity";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";

type Exercise =
  | { kind: "intro"; word: Word }
  | { kind: "choice"; dir: "toNative" | "toTarget"; word: Word; options: string[] }
  | { kind: "listen"; word: Word; options: string[] }
  | { kind: "type"; word: Word }
  | { kind: "pairs"; words: Word[] }
  | { kind: "speak"; word: Word };

export interface LessonResult {
  hearts: number;
  stars: number;
  xp: number;
  answers: LessonAnswer[];
}

export interface LessonAnswer {
  word: Word;
  correct: boolean;
  /** Tipo de ejercicio (para las estadísticas). */
  kind: string;
}

interface Props {
  title: string;
  words: Word[];
  /** Palabras que el estudiante ya conoce (no se muestran como nuevas). */
  known: Set<string>;
  lang: string;
  onExit: () => void;
  onFinish: (r: LessonResult) => void;
}

const MAX_HEARTS = 5;

function distractors(all: Word[], word: Word, field: "word" | "translation") {
  const others = shuffle(all.filter((w) => w[field] !== word[field])).slice(0, 3);
  return shuffle([word[field], ...others.map((w) => w[field])]);
}

/** Construye la secuencia de ejercicios de la lección. */
function buildExercises(words: Word[], known: Set<string>, canSpeak: boolean): Exercise[] {
  const list = shuffle(words);
  const out: Exercise[] = [];
  const rotation: ("toNative" | "toTarget" | "listen" | "type")[] = ["toNative", "listen", "toTarget", "type"];
  list.forEach((w, i) => {
    if (!known.has(w.word)) out.push({ kind: "intro", word: w });
    const r = rotation[i % rotation.length];
    if (r === "listen") out.push({ kind: "listen", word: w, options: distractors(words, w, "word") });
    else if (r === "type") out.push({ kind: "type", word: w });
    else
      out.push({
        kind: "choice",
        dir: r,
        word: w,
        options: distractors(words, w, r === "toNative" ? "translation" : "word"),
      });
    if (i === Math.floor(list.length / 2) && words.length >= 4) {
      out.push({ kind: "pairs", words: shuffle(words).slice(0, 4) });
    }
  });
  // Repaso final: traducir en sentido inverso las primeras palabras.
  list.slice(0, 2).forEach((w) =>
    out.push({ kind: "choice", dir: "toTarget", word: w, options: distractors(words, w, "word") })
  );
  if (canSpeak) shuffle(list).slice(0, 2).forEach((w) => out.push({ kind: "speak", word: w }));
  return out;
}

export default function LessonPlayer({ title, words, known, lang, onExit, onFinish }: Props) {
  const { speak } = useSpeechSynthesis(lang);
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setCanSpeak(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Se fija al empezar: si el padre actualiza las palabras conocidas, la lección no se reinicia.
  const [knownAtStart] = useState(known);
  const initial = useMemo(
    () => buildExercises(words, knownAtStart, canSpeak),
    [words, knownAtStart, canSpeak]
  );
  const [queue, setQueue] = useState<Exercise[]>(initial);
  useEffect(() => setQueue(initial), [initial]);

  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [heard, setHeard] = useState("");
  const [feedback, setFeedback] = useState<null | { ok: boolean; message: string }>(null);
  const [answers, setAnswers] = useState<LessonAnswer[]>([]);
  const [requeued, setRequeued] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState(false);

  const ex = queue[index];
  const progress = queue.length ? index / queue.length : 0;

  // Reproduce el audio automáticamente en ejercicios de escucha y al presentar palabras.
  useEffect(() => {
    if (!ex) return;
    if (ex.kind === "listen" || ex.kind === "intro") speak(ex.word.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue]);

  const rec = useSpeechRecognition(lang, (text) => setHeard(text));

  function reset() {
    setSelected(null);
    setTyped("");
    setHeard("");
    setFeedback(null);
  }

  function next() {
    reset();
    if (index + 1 >= queue.length) {
      const stars = hearts >= 4 ? 3 : hearts >= 2 ? 2 : 1;
      onFinish({ hearts, stars, xp: 10 + hearts, answers });
      return;
    }
    setIndex(index + 1);
  }

  function grade(ok: boolean, word: Word, message: string) {
    setFeedback({ ok, message });
    // "choice" se separa por sentido: reconocer (al español) o recordar (al idioma).
    const kind = ex?.kind === "choice" ? (ex.dir === "toNative" ? "recognize" : "recall") : (ex?.kind ?? "other");
    setAnswers((a) => [...a, { word, correct: ok, kind }]);
    if (ok) {
      speak(word.word);
      return;
    }
    const left = hearts - 1;
    setHearts(left);
    if (left <= 0) {
      setFailed(true);
      return;
    }
    // Como en Duolingo, el ejercicio fallado vuelve al final (una vez).
    if (!requeued.has(index)) {
      setRequeued(new Set(requeued).add(index));
      setQueue((q) => [...q, q[index]]);
    }
  }

  function check() {
    if (!ex || feedback) return;
    switch (ex.kind) {
      case "choice": {
        const expected = ex.dir === "toNative" ? ex.word.translation : ex.word.word;
        const ok = selected === expected;
        grade(ok, ex.word, ok ? "¡Correcto!" : `Respuesta correcta: ${expected}`);
        break;
      }
      case "listen": {
        const ok = selected === ex.word.word;
        grade(ok, ex.word, ok ? "¡Bien oído!" : `Era: ${ex.word.word} (${ex.word.translation})`);
        break;
      }
      case "type": {
        const r = checkTyped(typed, ex.word.word);
        grade(
          r !== "wrong",
          ex.word,
          r === "ok" ? "¡Perfecto!" : r === "typo" ? `Casi: se escribe ${ex.word.word}` : `Respuesta correcta: ${ex.word.word}`
        );
        break;
      }
      case "speak": {
        const { score } = compareSpeech(ex.word.example, heard);
        const ok = score >= 70;
        grade(ok, ex.word, ok ? `¡Muy bien! (${score}/100)` : `Se entendió: “${heard || "nada"}” (${score}/100)`);
        break;
      }
    }
  }

  function skipSpeak() {
    if (ex?.kind !== "speak") return;
    setFeedback({ ok: true, message: "Ejercicio de voz omitido" });
  }

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-6xl">💔</div>
        <h2 className="text-2xl font-bold">Te quedaste sin vidas</h2>
        <p className="text-slate-500">No pasa nada: repasa y vuelve a intentarlo.</p>
        <div className="flex gap-2">
          <button onClick={onExit} className="rounded-2xl border-2 border-slate-200 px-5 py-3 font-bold">
            Salir
          </button>
          <button
            onClick={() => {
              setQueue(buildExercises(words, knownAtStart, canSpeak));
              setIndex(0);
              setHearts(MAX_HEARTS);
              setAnswers([]);
              setRequeued(new Set());
              setFailed(false);
              reset();
            }}
            className="rounded-2xl bg-brand-600 px-5 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!ex) return null;

  const canCheck =
    (ex.kind === "choice" || ex.kind === "listen") ? selected !== null
    : ex.kind === "type" ? typed.trim().length > 0
    : ex.kind === "speak" ? heard.length > 0
    : false;

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera: salir, barra de progreso y vidas */}
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-4">
        <button onClick={onExit} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Salir">
          <X className="size-6" />
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="flex items-center gap-1 font-bold text-rose-500">
          <Heart className="size-5" fill="currentColor" /> {hearts}
        </span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>

        {ex.kind === "intro" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Palabra nueva</h2>
            <div className="rounded-3xl border-2 border-slate-200 p-6 text-center">
              <div className="text-6xl">{ex.word.emoji}</div>
              <button
                onClick={() => speak(ex.word.word)}
                className="mt-3 inline-flex items-center gap-2 text-3xl font-bold hover:text-brand-700"
              >
                {ex.word.word} <Volume2 className="size-6 text-brand-600" />
              </button>
              <p className="mt-1 text-lg text-slate-500">{ex.word.translation}</p>
              <button
                onClick={() => speak(ex.word.example, 0.85)}
                className="mt-4 block w-full rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Volume2 className="size-4 shrink-0 text-brand-600" /> {ex.word.example}
                </span>
                <span className="block pl-6 text-sm text-slate-500">{ex.word.exampleTranslation}</span>
              </button>
            </div>
          </div>
        )}

        {ex.kind === "choice" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold">
              {ex.dir === "toNative" ? "¿Qué significa?" : "¿Cómo se dice?"}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{ex.word.emoji}</span>
              {ex.dir === "toNative" ? (
                <button onClick={() => speak(ex.word.word)} className="flex items-center gap-2 text-2xl font-semibold">
                  <Volume2 className="size-5 text-brand-600" /> {ex.word.word}
                </button>
              ) : (
                <span className="text-2xl font-semibold">{ex.word.translation}</span>
              )}
            </div>
            <Options options={ex.options} selected={selected} onSelect={setSelected} disabled={!!feedback} />
          </div>
        )}

        {ex.kind === "listen" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold">Escucha y elige</h2>
            <div className="flex gap-3">
              <button
                onClick={() => speak(ex.word.word)}
                className="flex size-20 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-[0_4px_0_#0d8b6c]"
                aria-label="Escuchar"
              >
                <Volume2 className="size-9" />
              </button>
              <button
                onClick={() => speak(ex.word.word, 0.6)}
                className="flex size-14 items-center justify-center self-end rounded-2xl bg-brand-100 text-2xl"
                aria-label="Escuchar lento"
              >
                🐢
              </button>
            </div>
            <Options options={ex.options} selected={selected} onSelect={setSelected} disabled={!!feedback} />
          </div>
        )}

        {ex.kind === "type" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold">Escribe en el idioma</h2>
            <p className="flex items-center gap-3 text-2xl font-semibold">
              <span className="text-4xl">{ex.word.emoji}</span> {ex.word.translation}
            </p>
            <input
              autoFocus
              value={typed}
              disabled={!!feedback}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canCheck && check()}
              placeholder="Escribe aquí…"
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-lg outline-none focus:border-brand-600"
            />
          </div>
        )}

        {ex.kind === "pairs" && (
          <Pairs key={index} words={ex.words} speak={speak} onDone={() => setFeedback({ ok: true, message: "¡Todas las parejas!" })} />
        )}

        {ex.kind === "speak" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold">Lee en voz alta</h2>
            <button
              onClick={() => speak(ex.word.example, 0.9)}
              className="flex items-start gap-2 text-left text-xl font-semibold"
            >
              <Volume2 className="mt-1 size-5 shrink-0 text-brand-600" /> {ex.word.example}
            </button>
            <p className="text-slate-500">{ex.word.exampleTranslation}</p>
            <button
              onClick={rec.listening ? rec.stop : rec.start}
              disabled={!!feedback}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 py-4 font-bold ${
                rec.listening ? "animate-pulse border-rose-300 bg-rose-50 text-rose-600" : "border-slate-200 text-brand-700 hover:bg-slate-50"
              }`}
            >
              {rec.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              {rec.listening ? rec.interim || "Escuchando…" : heard ? "Volver a grabar" : "Pulsa para hablar"}
            </button>
            {heard && !rec.listening && <p className="text-sm text-slate-500">Se oyó: “{heard}”</p>}
            {rec.error && <p className="text-sm text-rose-600">{rec.error}</p>}
          </div>
        )}
      </div>

      {/* Pie: comprobar / continuar, con color de resultado */}
      <div
        className={`border-t-2 ${
          feedback ? (feedback.ok ? "border-brand-100 bg-brand-50" : "border-rose-100 bg-rose-50") : "border-slate-100"
        }`}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-h-6 font-bold">
            {feedback && (
              <span className={feedback.ok ? "text-brand-700" : "text-rose-600"}>
                {feedback.ok ? "✔ " : "✘ "}
                {feedback.message}
              </span>
            )}
            {!feedback && ex.kind === "speak" && (
              <button onClick={skipSpeak} className="text-sm font-semibold text-slate-400 hover:text-slate-600">
                No puedo hablar ahora
              </button>
            )}
          </div>
          {ex.kind === "intro" || feedback ? (
            <button
              onClick={next}
              className={`rounded-2xl px-8 py-3 font-bold text-white ${
                feedback && !feedback.ok ? "bg-rose-500 shadow-[0_4px_0_#be123c]" : "bg-brand-600 shadow-[0_4px_0_#0d8b6c]"
              }`}
            >
              Continuar
            </button>
          ) : ex.kind === "pairs" ? null : (
            <button
              onClick={check}
              disabled={!canCheck}
              className="rounded-2xl bg-brand-600 px-8 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              Comprobar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Options({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: string[];
  selected: string | null;
  onSelect: (o: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o, i) => (
        <button
          key={o}
          disabled={disabled}
          onClick={() => onSelect(o)}
          className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg shadow-[0_2px_0] ${
            selected === o
              ? "border-brand-600 bg-brand-50 text-brand-700 shadow-brand-600"
              : "border-slate-200 shadow-slate-200 hover:bg-slate-50"
          }`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border-2 border-slate-200 text-sm text-slate-400">
            {i + 1}
          </span>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Une cada palabra con su traducción. */
export function Pairs({
  words,
  speak,
  onDone,
}: {
  words: Word[];
  speak: (t: string) => void;
  onDone: (mistakes: number) => void;
}) {
  const left = useMemo(() => shuffle(words.map((w) => w.word)), [words]);
  const right = useMemo(() => shuffle(words.map((w) => w.translation)), [words]);
  const [pickL, setPickL] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);

  useEffect(() => {
    if (!pickL || !pickR) return;
    const w = words.find((x) => x.word === pickL)!;
    if (w.translation === pickR) {
      const next = new Set(matched).add(pickL);
      setMatched(next);
      if (next.size === words.length) onDone(mistakes);
    } else {
      setMistakes((m) => m + 1);
      setWrong(`${pickL}|${pickR}`);
      setTimeout(() => setWrong(null), 500);
    }
    setPickL(null);
    setPickR(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickL, pickR]);

  const isMatchedRight = (t: string) => words.some((w) => w.translation === t && matched.has(w.word));
  const cls = (active: boolean, done: boolean, bad: boolean) =>
    `w-full rounded-2xl border-2 px-3 py-3 text-lg shadow-[0_2px_0] transition ${
      done
        ? "border-slate-100 text-slate-300 shadow-transparent"
        : bad
          ? "border-rose-400 bg-rose-50 text-rose-600 shadow-rose-300"
          : active
            ? "border-brand-600 bg-brand-50 text-brand-700 shadow-brand-600"
            : "border-slate-200 shadow-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Une las parejas</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {left.map((t) => (
            <button
              key={t}
              disabled={matched.has(t)}
              onClick={() => {
                speak(t);
                setPickL(t);
              }}
              className={cls(pickL === t, matched.has(t), wrong?.startsWith(`${t}|`) ?? false)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {right.map((t) => (
            <button
              key={t}
              disabled={isMatchedRight(t)}
              onClick={() => setPickR(t)}
              className={cls(pickR === t, isMatchedRight(t), wrong?.endsWith(`|${t}`) ?? false)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
