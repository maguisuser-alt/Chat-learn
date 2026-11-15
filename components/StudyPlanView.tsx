"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import type { StudyPlanDTO } from "@/lib/types";

interface Props {
  plan: StudyPlanDTO | null;
  loading: boolean;
  onGenerate: (days: number, minutesPerDay: number) => void;
  onToggleDay: (day: number, completed: boolean) => void;
}

export default function StudyPlanView({ plan, loading, onGenerate, onToggleDay }: Props) {
  const [days, setDays] = useState(7);
  const [minutes, setMinutes] = useState(45);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarDays className="size-4" /> 2. Plan de estudio
      </h2>

      <div className="flex items-end gap-2 text-sm">
        <label className="flex-1 space-y-1">
          <span className="text-slate-500">Días</span>
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-slate-500">Min/día</span>
          <input
            type="number"
            min={10}
            max={240}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          onClick={() => onGenerate(days, minutes)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {plan ? "Regenerar" : "Generar"}
        </button>
      </div>

      {plan && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{plan.goal}</p>
          <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {plan.days.map((d) => (
              <li
                key={d.day}
                className={`rounded-lg border p-3 text-sm ${
                  d.completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <button
                  onClick={() => onToggleDay(d.day, !d.completed)}
                  className="flex w-full items-center gap-2 text-left font-medium"
                >
                  {d.completed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-brand-600" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-slate-400" />
                  )}
                  Día {d.day}: {d.focus}
                </button>
                <ul className="mt-2 list-disc space-y-1 pl-9 text-slate-600">
                  {d.activities.map((a, i) => (
                    <li key={i}>
                      <span className="font-medium">{a.title}</span> ({a.minutes} min) –{" "}
                      {a.description}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 pl-6 text-xs text-slate-500">Repaso: {d.review}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
