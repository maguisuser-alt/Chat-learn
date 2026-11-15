"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, Layers, Pencil, Play, Plus, Trash2 } from "lucide-react";
import CardReview, { type ReviewItem } from "@/components/study/CardReview";
import StudyModal, { type StudyMode } from "@/components/study/StudyModal";
import { dueWords, mastery, nextDue, type Mastery } from "@/lib/srs";
import { deckAsText, type Deck } from "@/lib/study";
import type { DecksApi } from "@/lib/useDecks";

interface Props {
  decks: DecksApi;
  provider?: string;
}

const MASTERY_COLOR: Record<Mastery, string> = {
  nueva: "bg-slate-300",
  aprendiendo: "bg-amber-400",
  consolidada: "bg-sky-500",
  dominada: "bg-brand-600",
};

/** Cuándo toca el próximo repaso, en palabras. */
function whenLabel(due: number | null, now: number) {
  if (due === null) return "";
  const mins = Math.round((due - now) / 60_000);
  if (mins < 60) return `en ${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `en ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "mañana" : `en ${days} días`;
}

function MasteryBar({ deck }: { deck: Deck }) {
  const counts = deck.cards.reduce<Record<Mastery, number>>(
    (acc, c) => ({ ...acc, [mastery(c)]: acc[mastery(c)] + 1 }),
    { nueva: 0, aprendiendo: 0, consolidada: 0, dominada: 0 }
  );
  const total = deck.cards.length || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" title={Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}>
      {(Object.keys(counts) as Mastery[]).map((m) =>
        counts[m] ? <div key={m} className={MASTERY_COLOR[m]} style={{ width: `${(counts[m] / total) * 100}%` }} /> : null
      )}
    </div>
  );
}

/** Sección «Tarjetas»: mazos guardados, repaso espaciado y exámenes. */
export default function CardsView({ decks, provider }: Props) {
  const [session, setSession] = useState<{ title: string; items: ReviewItem[] } | null>(null);
  const [modal, setModal] = useState<{ mode: StudyMode; text: string; topic?: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [creating, setCreating] = useState(false);
  const now = Date.now();

  const allDue = dueWords(
    decks.decks.flatMap((d) => d.cards.map((c) => ({ ...c, deckId: d.id }))),
    now,
    50
  );

  function startDeck(deck: Deck) {
    const due = dueWords(deck.cards, Date.now(), 50);
    // Si no toca ninguna, se practica el mazo entero (no adelanta el calendario de las sabidas).
    const list = due.length ? due : deck.cards;
    setSession({ title: deck.title, items: list.map((card) => ({ deckId: deck.id, card })) });
  }

  if (session) {
    return (
      <div className="h-full overflow-y-auto px-4 pb-10">
        <CardReview items={session.items} title={session.title} onReview={decks.review} onClose={() => setSession(null)} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      {modal && (
        <StudyModal
          mode={modal.mode}
          text={modal.text}
          topic={modal.topic}
          provider={provider}
          decks={decks}
          onClose={() => setModal(null)}
        />
      )}

      <div className="mx-auto max-w-3xl space-y-6 py-4">
        {/* Repaso del día */}
        <section className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-sky-100 bg-sky-50 p-5">
          <Layers className="size-10 text-sky-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Repaso de hoy</h2>
            <p className="text-sm text-slate-600">
              {!decks.decks.length
                ? "Aún no tienes mazos. Créalos desde cualquier respuesta del chat o pegando un texto aquí abajo."
                : allDue.length
                  ? `${allDue.length} tarjeta${allDue.length === 1 ? "" : "s"} para repasar.`
                  : `Todo al día. Próximo repaso ${whenLabel(nextDue(decks.decks.flatMap((d) => d.cards), now), now)}.`}
            </p>
          </div>
          {allDue.length > 0 && (
            <button
              onClick={() =>
                setSession({ title: "Repaso de hoy", items: allDue.map(({ deckId, ...card }) => ({ deckId, card })) })
              }
              className="flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-2.5 font-bold text-white shadow-[0_4px_0_#0369a1]"
            >
              <Play className="size-4" /> Repasar
            </button>
          )}
        </section>

        {/* Crear desde un texto */}
        <section className="rounded-3xl border border-slate-200 p-4">
          <button onClick={() => setCreating((v) => !v)} className="flex w-full items-center gap-2 text-left font-semibold">
            <Plus className="size-5" /> Crear desde un texto (apuntes, resumen, artículo…)
            <ChevronDown className={`ml-auto size-4 transition ${creating ? "rotate-180" : ""}`} />
          </button>
          {creating && (
            <div className="mt-3 space-y-2">
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={6}
                maxLength={12_000}
                placeholder="Pega aquí el material de estudio (mínimo unas líneas)"
                className="w-full resize-y rounded-2xl border border-slate-200 p-3 text-[15px] outline-none focus:border-brand-600"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">{newText.length.toLocaleString("es-ES")}/12.000</span>
                <button
                  disabled={newText.trim().length < 40}
                  onClick={() => setModal({ mode: "quiz", text: newText })}
                  className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  <ClipboardList className="size-4" /> Examen
                </button>
                <button
                  disabled={newText.trim().length < 40}
                  onClick={() => setModal({ mode: "cards", text: newText })}
                  className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Layers className="size-4" /> Tarjetas
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Mazos */}
        {decks.decks.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Tus mazos</h2>
            {decks.decks.map((deck) => {
              const due = dueWords(deck.cards, now, Infinity).length;
              const expanded = open === deck.id;
              return (
                <div key={deck.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setOpen(expanded ? null : deck.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-semibold">{deck.title}</p>
                      <p className="text-xs text-slate-500">
                        {deck.cards.length} tarjetas · {due ? `${due} para hoy` : "al día"} · creado el{" "}
                        {new Date(deck.createdAt).toLocaleDateString("es-ES")}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startDeck(deck)}
                        disabled={!deck.cards.length}
                        className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        title={due ? "Repasar las que tocan" : "Practicar todo el mazo"}
                      >
                        <Play className="size-3.5" /> {due ? "Repasar" : "Practicar"}
                      </button>
                      <button
                        onClick={() => setModal({ mode: "quiz", text: deckAsText(deck), topic: deck.title })}
                        disabled={deck.cards.length < 3}
                        className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                        title="Examen tipo test sobre este mazo"
                      >
                        <ClipboardList className="size-3.5" /> Examen
                      </button>
                      <button
                        onClick={() => {
                          const t = window.prompt("Nuevo nombre del mazo", deck.title);
                          if (t) decks.renameDeck(deck.id, t);
                        }}
                        className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Renombrar ${deck.title}`}
                        title="Renombrar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => window.confirm(`¿Eliminar el mazo «${deck.title}» y sus ${deck.cards.length} tarjetas?`) && decks.removeDeck(deck.id)}
                        className="rounded-full p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                        aria-label={`Eliminar ${deck.title}`}
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <MasteryBar deck={deck} />
                  </div>
                  {expanded && (
                    <ul className="mt-3 space-y-1.5">
                      {deck.cards.map((c) => (
                        <li key={c.id} className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${MASTERY_COLOR[mastery(c)]}`} title={mastery(c)} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{c.front}</p>
                            <p className="text-slate-600">{c.back}</p>
                          </div>
                          <button
                            onClick={() => decks.removeCard(deck.id, c.id)}
                            className="self-start rounded-full p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                            aria-label="Eliminar tarjeta"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <p className="flex flex-wrap gap-3 text-xs text-slate-500">
              {(Object.keys(MASTERY_COLOR) as Mastery[]).map((m) => (
                <span key={m} className="flex items-center gap-1">
                  <span className={`size-2 rounded-full ${MASTERY_COLOR[m]}`} /> {m}
                </span>
              ))}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
