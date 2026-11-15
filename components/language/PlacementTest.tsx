"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Target, X } from "lucide-react";
import { placementLevel, type PlacementAnswer, type PlacementQuestion, type PlacementResult } from "@/lib/placement";
import { shuffle } from "@/lib/similarity";
import type { Profile } from "@/lib/languages";
import type { ProgressApi } from "@/lib/progress";

interface Props {
  profile: Profile;
  api: ProgressApi;
  onClose: () => void;
  /** Aplica el nivel obtenido al perfil. */
  onApplyLevel: (level: string) => void;
}

const LEVEL_INFO: Record<string, string> = {
  A1: "Principiante: frases básicas del día a día.",
  A2: "Elemental: situaciones sencillas y habituales.",
  B1: "Intermedio: te defiendes en viajes y temas conocidos.",
  B2: "Intermedio alto: conversas con soltura sobre muchos temas.",
  C1: "Avanzado: te expresas con fluidez y precisión.",
  C2: "Maestría: dominas matices, registros y expresiones.",
};

type Shuffled = PlacementQuestion & { order: number[] };

export default function PlacementTest({ profile, api, onClose, onApplyLevel }: Props) {
  const [questions, setQuestions] = useState<Shuffled[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [result, setResult] = useState<PlacementResult | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "placement", language: profile.language, provider: profile.provider }),
      });
      const json = (await res.json()) as { questions?: PlacementQuestion[]; error?: string };
      if (!res.ok || !json.questions) throw new Error(json.error ?? "No se pudo crear el test");
      // Se barajan las opciones para que la correcta no esté siempre en el mismo sitio.
      setQuestions(json.questions.map((q) => ({ ...q, order: shuffle([0, 1, 2, 3]) })));
      setIndex(0);
      setAnswers([]);
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el test");
    } finally {
      setLoading(false);
    }
  }

  function answer(optionIndex: number | null) {
    if (!questions) return;
    const q = questions[index];
    const next = [...answers, { level: q.level, correct: optionIndex === q.answer }];
    setAnswers(next);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    const r = placementLevel(next);
    setResult(r);
    api.setPlacement({ level: r.level, correct: r.correct, total: r.total, date: Date.now() });
    api.addXp(15);
  }

  const q = questions?.[index];
  const progressPct = questions ? (index / questions.length) * 100 : 0;
  const last = api.lang.placement;
  const levelLabel = useMemo(() => (result ? LEVEL_INFO[result.level] : ""), [result]);

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-xl space-y-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Salir del test">
            <X className="size-6" />
          </button>
          {questions && !result && (
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>

        {!questions && (
          <div className="space-y-4 rounded-3xl border-2 border-slate-100 p-6 text-center">
            <Target className="mx-auto size-12 text-brand-600" />
            <h2 className="text-2xl font-bold">Test de nivel de {profile.language}</h2>
            <p className="text-slate-600">
              Hasta 18 preguntas, de A1 a C2, revisadas por la IA. Unos 4 minutos. No hay vidas ni penalización: responde lo que sepas y usa
              «No lo sé» si no tienes idea.
            </p>
            {last && (
              <p className="text-sm text-slate-500">
                Último resultado: <b>{last.level}</b> ({last.correct}/{last.total}) el{" "}
                {new Date(last.date).toLocaleDateString("es-ES")}
              </p>
            )}
            {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
            <button
              onClick={start}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-8 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c] disabled:opacity-60"
            >
              {loading && <Loader2 className="size-5 animate-spin" />}
              {loading ? "Preparando el test…" : last ? "Repetir el test" : "Empezar"}
            </button>
          </div>
        )}

        {q && !result && (
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Pregunta {index + 1} de {questions!.length} · {q.skill}
            </p>
            <h2 className="text-xl font-bold">{q.prompt}</h2>
            <p className="rounded-2xl bg-slate-50 p-4 text-lg font-medium">{q.text}</p>
            <div className="grid gap-3">
              {q.order.map((oi) => (
                <button
                  key={oi}
                  onClick={() => answer(oi)}
                  className="rounded-2xl border-2 border-slate-200 px-4 py-3 text-left text-lg shadow-[0_2px_0] shadow-slate-200 hover:border-brand-600 hover:bg-brand-50"
                >
                  {q.options[oi]}
                </button>
              ))}
            </div>
            <button onClick={() => answer(null)} className="text-sm font-semibold text-slate-400 hover:text-slate-600">
              No lo sé
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-5 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Tu nivel estimado</p>
            <div className="mx-auto flex size-28 items-center justify-center rounded-full bg-brand-600 text-5xl font-extrabold text-white shadow-[0_6px_0_#0d8b6c]">
              {result.level}
            </div>
            <p className="text-slate-600">{levelLabel}</p>
            <p className="text-sm text-slate-500">
              {result.correct} de {result.total} respuestas correctas · +15 XP
            </p>

            <ul className="space-y-1.5 text-left text-sm">
              {result.byLevel.map((l) => {
                const passed = l.total > 0 && l.ok / l.total >= 2 / 3 - 1e-9;
                return (
                  <li key={l.level} className="flex items-center gap-3">
                    <span className="w-8 font-bold">{l.level}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${passed ? "bg-brand-600" : "bg-amber-400"}`}
                        style={{ width: `${l.total ? (l.ok / l.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums text-slate-500">
                      {l.ok}/{l.total}
                    </span>
                    {passed ? <Check className="size-4 text-brand-700" /> : <span className="size-4" />}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap justify-center gap-2">
              {profile.level !== result.level ? (
                <button
                  onClick={() => {
                    onApplyLevel(result.level);
                    onClose();
                  }}
                  className="rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
                >
                  Usar nivel {result.level}
                </button>
              ) : (
                <p className="w-full text-sm text-brand-700">Ya estudias en el nivel {result.level}. ¡Bien elegido!</p>
              )}
              <button onClick={onClose} className="rounded-2xl border-2 border-slate-200 px-6 py-3 font-bold">
                {profile.level !== result.level ? `Seguir en ${profile.level}` : "Volver"}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Es una estimación orientativa generada por IA, no un certificado oficial.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
