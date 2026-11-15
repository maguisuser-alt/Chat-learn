"use client";

import { useMemo, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { quizGrade, type QuizQuestion } from "@/lib/study";
import { shuffle } from "@/lib/similarity";

interface Props {
  title: string;
  questions: QuizQuestion[];
  /** Pide un examen nuevo sobre el mismo material. */
  onNew?: () => void;
  onClose: () => void;
}

type Shuffled = QuizQuestion & { order: number[] };

/** Examen tipo test con corrección inmediata y resumen final. */
export default function QuizRunner({ title, questions, onNew, onClose }: Props) {
  const [attempt, setAttempt] = useState(0);
  const items = useMemo<Shuffled[]>(
    () => questions.map((q) => ({ ...q, order: shuffle([0, 1, 2, 3]) })),
    // Cada intento baraja de nuevo las opciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, attempt]
  );
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const finished = answers.length === items.length;
  const q = items[index];
  const correct = answers.filter((a, i) => a === items[i]?.answer).length;

  function pick(option: number) {
    if (picked !== null) return;
    setPicked(option);
  }

  function next() {
    setAnswers([...answers, picked]);
    setPicked(null);
    if (index + 1 < items.length) setIndex(index + 1);
  }

  function restart() {
    setAttempt((a) => a + 1);
    setIndex(0);
    setPicked(null);
    setAnswers([]);
  }

  if (finished) {
    const grade = quizGrade(correct, items.length);
    const wrong = items.map((it, i) => ({ it, a: answers[i] })).filter(({ it, a }) => a !== it.answer);
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</p>
          <div
            className={`mx-auto flex size-24 items-center justify-center rounded-full text-3xl font-extrabold text-white ${
              grade >= 5 ? "bg-brand-600 shadow-[0_6px_0_#0d8b6c]" : "bg-amber-500 shadow-[0_6px_0_#b45309]"
            }`}
          >
            {grade.toLocaleString("es-ES")}
          </div>
          <p className="text-slate-600">
            {correct} de {items.length} correctas
            {grade >= 9 ? " · ¡Excelente!" : grade >= 5 ? " · Aprobado" : " · Repasa el material y vuelve a intentarlo"}
          </p>
        </div>

        {wrong.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Revisa estas preguntas</h3>
            <ul className="space-y-2">
              {wrong.map(({ it, a }, i) => (
                <li key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-medium">{it.question}</p>
                  {a !== null && <p className="mt-1 text-rose-600">Tu respuesta: {it.options[a]}</p>}
                  <p className="text-brand-700">Correcta: {it.options[it.answer]}</p>
                  <p className="mt-1 text-slate-500">{it.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={restart} className="rounded-2xl border-2 border-slate-200 px-5 py-2.5 font-bold">
            Repetir
          </button>
          {onNew && (
            <button onClick={onNew} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 py-2.5 font-bold">
              <RefreshCw className="size-4" /> Examen nuevo
            </button>
          )}
          <button onClick={onClose} className="rounded-2xl bg-brand-600 px-6 py-2.5 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
            Terminar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-slate-500">
          {index + 1}/{items.length}
        </span>
      </div>
      <h3 className="text-lg font-bold">{q.question}</h3>
      <div className="grid gap-2.5">
        {q.order.map((oi) => {
          const isAnswer = oi === q.answer;
          const isPicked = oi === picked;
          const state =
            picked === null
              ? "border-slate-200 hover:border-brand-600 hover:bg-brand-50"
              : isAnswer
                ? "border-brand-600 bg-brand-50"
                : isPicked
                  ? "border-rose-300 bg-rose-50"
                  : "border-slate-200 opacity-60";
          return (
            <button
              key={oi}
              type="button"
              onClick={() => pick(oi)}
              disabled={picked !== null}
              className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-3 text-left ${state}`}
            >
              <span className="flex-1">{q.options[oi]}</span>
              {picked !== null && isAnswer && <Check className="size-5 shrink-0 text-brand-700" />}
              {picked !== null && isPicked && !isAnswer && <X className="size-5 shrink-0 text-rose-600" />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="space-y-3">
          <p
            className={`rounded-2xl p-3 text-sm ${
              picked === q.answer ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            <b>{picked === q.answer ? "¡Correcto! " : "No es correcta. "}</b>
            {q.explanation}
          </p>
          <button onClick={next} className="w-full rounded-2xl bg-brand-600 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
            {index + 1 < items.length ? "Siguiente" : "Ver nota"}
          </button>
        </div>
      )}
    </div>
  );
}
