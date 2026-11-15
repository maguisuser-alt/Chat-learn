"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { StudyCard } from "@/lib/study";

export interface ReviewItem {
  deckId: string;
  card: StudyCard;
}

interface Props {
  items: ReviewItem[];
  title: string;
  onReview: (deckId: string, cardId: string, correct: boolean) => void;
  onClose: () => void;
}

/**
 * Sesión de repaso: se muestra el anverso, la persona intenta recordar, gira la
 * tarjeta y dice si la sabía. Las falladas vuelven al final de la cola una vez.
 */
export default function CardReview({ items, title, onReview, onClose }: Props) {
  const [queue, setQueue] = useState<ReviewItem[]>(items);
  const [flipped, setFlipped] = useState(false);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ ok: 0, ko: 0 });
  const total = items.length;
  const current = queue[0];

  function grade(correct: boolean) {
    if (!current) return;
    // Solo cuenta para el calendario el primer intento de cada tarjeta en la sesión.
    if (!requeued.has(current.card.id)) {
      onReview(current.deckId, current.card.id, correct);
      setStats((s) => (correct ? { ...s, ok: s.ok + 1 } : { ...s, ko: s.ko + 1 }));
    }
    const rest = queue.slice(1);
    if (!correct && !requeued.has(current.card.id)) {
      setRequeued(new Set(requeued).add(current.card.id));
      setQueue([...rest, current]);
    } else {
      setQueue(rest);
    }
    setFlipped(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (!current) return;
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === "1" || e.key === "ArrowLeft")) grade(false);
      else if (flipped && (e.key === "2" || e.key === "ArrowRight")) grade(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const done = total - new Set(queue.map((q) => q.card.id)).size;

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Terminar repaso">
          <X className="size-6" />
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span className="text-sm tabular-nums text-slate-500">
          {done}/{total}
        </span>
      </div>

      {current ? (
        <>
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="flex min-h-[240px] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-200 bg-white p-6 text-center shadow-[0_4px_0] shadow-slate-200"
            aria-label={flipped ? "Ver pregunta" : "Ver respuesta"}
          >
            <p className="whitespace-pre-wrap text-xl font-semibold">{current.card.front}</p>
            {flipped ? (
              <p className="whitespace-pre-wrap border-t border-slate-100 pt-4 text-lg text-slate-700">{current.card.back}</p>
            ) : (
              <span className="text-sm text-slate-400">Piensa la respuesta y pulsa para girar (Espacio)</span>
            )}
          </button>

          {flipped ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => grade(false)}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3 font-bold text-rose-700 hover:bg-rose-100"
              >
                <RotateCcw className="size-5" /> No la sabía
              </button>
              <button
                onClick={() => grade(true)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
              >
                <Check className="size-5" /> La sabía
              </button>
            </div>
          ) : (
            <button
              onClick={() => setFlipped(true)}
              className="w-full rounded-2xl bg-brand-600 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
            >
              Mostrar respuesta
            </button>
          )}
          <p className="text-center text-xs text-slate-400">Atajos: Espacio gira · 1 no la sabía · 2 la sabía</p>
        </>
      ) : (
        <div className="space-y-4 rounded-3xl border-2 border-slate-100 p-6 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-2xl font-bold">Repaso terminado</h2>
          <p className="text-slate-600">
            {stats.ok} sabidas · {stats.ko} para reforzar. Las que fallaste volverán a salir pronto; las que sabías, más adelante.
          </p>
          <button onClick={onClose} className="rounded-2xl bg-brand-600 px-8 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
            Volver
          </button>
        </div>
      )}
    </div>
  );
}
