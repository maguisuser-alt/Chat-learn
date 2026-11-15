"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

interface Props {
  messageId: string;
  conversationId: string;
  question: string;
  answer: string;
  provider: string;
  model: string;
}

const REASONS = [
  { id: "incorrecta", label: "Incorrecta" },
  { id: "incompleta", label: "Incompleta" },
  { id: "confusa", label: "Confusa" },
  { id: "no_respondio", label: "No respondió" },
] as const;

type Reason = (typeof REASONS)[number]["id"];

/** Valoración de una respuesta: ayuda a saber qué modelos responden mejor. */
export default function FeedbackButtons(props: Props) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);

  function send(next: "up" | "down", why?: Reason) {
    setRating(next);
    setReason(why ?? null);
    // Es secundario: si falla no se molesta al usuario.
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: props.messageId,
        conversationId: props.conversationId,
        rating: next,
        reason: why,
        provider: props.provider,
        model: props.model,
        // El servidor solo guarda el texto si la cuenta dio permiso.
        question: props.question.slice(0, 2000),
        answer: props.answer.slice(0, 6000),
      }),
    }).catch(() => {});
  }

  const btn = (active: boolean) =>
    `rounded-full p-1.5 transition hover:bg-slate-100 ${active ? "text-brand-700" : "text-slate-400"}`;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button onClick={() => send("up")} className={btn(rating === "up")} aria-label="Buena respuesta" aria-pressed={rating === "up"}>
        <ThumbsUp className="size-4" fill={rating === "up" ? "currentColor" : "none"} />
      </button>
      <button
        onClick={() => send("down", reason ?? undefined)}
        className={btn(rating === "down")}
        aria-label="Mala respuesta"
        aria-pressed={rating === "down"}
      >
        <ThumbsDown className="size-4" fill={rating === "down" ? "currentColor" : "none"} />
      </button>

      {rating === "down" && (
        <span className="ml-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">¿Qué falló?</span>
          {REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => send("down", r.id)}
              className={`rounded-full border px-2.5 py-0.5 ${
                reason === r.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </span>
      )}
      {rating && reason === null && rating === "up" && <span className="ml-1 text-xs text-slate-400">¡Gracias!</span>}
    </div>
  );
}
