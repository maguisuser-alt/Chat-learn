"use client";

import { DAILY_GOAL, type ProgressApi } from "@/lib/progress";

/** Racha, XP del idioma, palabras aprendidas y meta diaria. */
export default function StatsBar({ api }: { api: ProgressApi }) {
  const { progress, lang } = api;
  const today = Math.min(progress.todayXp, DAILY_GOAL);
  const learned = Object.keys(lang.words).length;

  return (
    <div className="space-y-2 rounded-2xl border-2 border-slate-100 p-3">
      <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
        <span className={progress.streak ? "text-orange-500" : "text-slate-400"} title="Días seguidos estudiando">
          🔥 {progress.streak} {progress.streak === 1 ? "día" : "días"}
        </span>
        <span className="text-amber-500" title="Experiencia en este idioma">
          ⚡ {lang.xp} XP
        </span>
        <span className="text-sky-600" title="Palabras aprendidas">
          📚 {learned} palabras
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="shrink-0">Meta diaria</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-400 transition-all"
            style={{ width: `${(today / DAILY_GOAL) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-semibold">
          {progress.todayXp}/{DAILY_GOAL} XP
        </span>
      </div>
    </div>
  );
}
