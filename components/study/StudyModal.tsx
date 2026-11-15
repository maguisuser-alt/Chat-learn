"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Layers, Loader2, Trash2, X } from "lucide-react";
import QuizRunner from "@/components/study/QuizRunner";
import { createDeck, MAX_SOURCE_CHARS, type QuizQuestion } from "@/lib/study";
import type { DecksApi } from "@/lib/useDecks";

export type StudyMode = "cards" | "quiz";

interface Props {
  mode: StudyMode;
  /** Material del que se crean las tarjetas o el examen. */
  text: string;
  topic?: string;
  chatId?: string;
  provider?: string;
  decks: DecksApi;
  onClose: () => void;
  /** Abre la sección Tarjetas (tras guardar un mazo). */
  onOpenCards?: () => void;
}

interface CardsResult {
  title: string;
  cards: { front: string; back: string }[];
}

interface QuizResult {
  title: string;
  questions: QuizQuestion[];
}

/** Ventana que crea tarjetas o un examen con IA a partir de un texto. */
export default function StudyModal({ mode, text, topic, chatId, provider, decks, onClose, onOpenCards }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardsResult | null>(null);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [target, setTarget] = useState<string>("new");
  const [saved, setSaved] = useState<string | null>(null);
  const request = useRef(0);

  const generate = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, text: text.slice(0, MAX_SOURCE_CHARS), topic: topic?.slice(0, 500), provider }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar el material");
      if (id !== request.current) return;
      if (mode === "cards") setCards(json as CardsResult);
      else setQuiz(json as QuizResult);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "No se pudo generar el material");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [mode, text, topic, provider]);

  useEffect(() => {
    generate();
    return () => {
      request.current++; // descarta respuestas que lleguen tras cerrar
    };
  }, [generate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    if (!cards || !cards.cards.length) return;
    if (target === "new") {
      const deck = createDeck(cards.title, cards.cards, Date.now(), chatId);
      decks.addDeck(deck);
      setSaved(`Mazo «${deck.title}» guardado con ${deck.cards.length} tarjetas.`);
    } else {
      const added = decks.addCards(target, cards.cards);
      const name = decks.decks.find((d) => d.id === target)?.title ?? "el mazo";
      setSaved(added ? `${added} tarjetas añadidas a «${name}».` : `Todas las tarjetas ya estaban en «${name}».`);
    }
  }

  const Icon = mode === "cards" ? Layers : ClipboardList;
  const heading = mode === "cards" ? "Tarjetas de estudio" : "Examen";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Icon className="size-5 text-brand-700" />
          <h2 className="font-semibold">{heading}</h2>
          <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
              <Loader2 className="size-8 animate-spin text-brand-600" />
              <p>{mode === "cards" ? "Creando las tarjetas…" : "Preparando y revisando el examen…"}</p>
            </div>
          )}

          {!loading && error && (
            <div className="space-y-3 py-6 text-center">
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
              <button onClick={generate} className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium hover:bg-slate-50">
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && mode === "quiz" && quiz && (
            <QuizRunner title={quiz.title} questions={quiz.questions} onNew={generate} onClose={onClose} />
          )}

          {!loading && !error && mode === "cards" && cards && (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Título del mazo</span>
                <input
                  value={cards.title}
                  onChange={(e) => setCards({ ...cards, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-brand-600"
                />
              </label>
              <ul className="space-y-2">
                {cards.cards.map((c, i) => (
                  <li key={i} className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">{c.front}</p>
                      <p className="text-slate-600">{c.back}</p>
                    </div>
                    <button
                      onClick={() => setCards({ ...cards, cards: cards.cards.filter((_, j) => j !== i) })}
                      className="self-start rounded-full p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                      aria-label="Quitar tarjeta"
                      title="Quitar tarjeta"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {!loading && !error && mode === "cards" && cards && (
          <div className="space-y-2 border-t border-slate-100 px-5 py-3">
            {saved ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-sm text-brand-700">{saved}</p>
                {onOpenCards && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCards();
                    }}
                    className="rounded-2xl bg-brand-600 px-5 py-2 font-bold text-white"
                  >
                    Ir a Tarjetas
                  </button>
                )}
                <button onClick={onClose} className="rounded-2xl border-2 border-slate-200 px-5 py-2 font-bold">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {decks.decks.length > 0 && (
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="max-w-[60%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    aria-label="Dónde guardar"
                  >
                    <option value="new">Mazo nuevo</option>
                    {decks.decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        Añadir a «{d.title}»
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={save}
                  disabled={!cards.cards.length}
                  className="ml-auto rounded-2xl bg-brand-600 px-5 py-2 font-bold text-white disabled:opacity-50"
                >
                  Guardar {cards.cards.length} tarjetas
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
