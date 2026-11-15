"use client";

import { useMemo, useState } from "react";
import { BookOpen, Flame, GraduationCap, Target, TrendingUp, Zap } from "lucide-react";
import { LESSON_ORDER } from "@/lib/lessons";
import { day, type ProgressApi } from "@/lib/progress";
import { forecast, mastery, MASTERY_LABEL, type Mastery } from "@/lib/srs";
import type { Profile } from "@/lib/languages";

interface Props {
  profile: Profile;
  api: ProgressApi;
  /** Ir a lecciones (repaso) o al test de nivel. */
  onGo: (where: "review" | "placement") => void;
}

const EXERCISE_LABEL: Record<string, string> = {
  recognize: "Reconocer (¿qué significa?)",
  recall: "Recordar (¿cómo se dice?)",
  listen: "Comprensión auditiva",
  type: "Escritura",
  speak: "Pronunciación",
  rush: "Juego contrarreloj",
};

const MASTERY_COLOR: Record<Mastery, string> = {
  nueva: "bg-slate-300",
  aprendiendo: "bg-amber-400",
  consolidada: "bg-sky-500",
  dominada: "bg-brand-600",
};

const WEEKDAY = ["D", "L", "M", "X", "J", "V", "S"];

function Card({ Icon, label, value, hint, color }: { Icon: typeof Zap; label: string; value: string; hint?: string; color: string }) {
  return (
    <div className="rounded-2xl border-2 border-slate-100 p-4">
      <p className={`flex items-center gap-1.5 text-xs font-bold uppercase ${color}`}>
        <Icon className="size-4" /> {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Barras verticales simples (sin librerías de gráficos). */
function Bars({ values, labels, highlight, color }: { values: number[]; labels: string[]; highlight?: number; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-36 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-slate-400">{v || ""}</span>
          <div
            className={`w-full rounded-t-md ${v ? color : "bg-slate-100"} ${highlight === i ? "ring-2 ring-offset-1 ring-slate-300" : ""}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`${labels[i]}: ${v}`}
          />
          <span className={`text-[10px] ${highlight === i ? "font-bold text-slate-700" : "text-slate-400"}`}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProgressStats({ profile, api, onGo }: Props) {
  const { lang, progress } = api;
  const [now] = useState(() => Date.now());
  const words = useMemo(() => Object.values(lang.words), [lang.words]);

  // XP de los últimos 14 días.
  const last14 = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => day(i - 13));
    return {
      values: days.map((d) => lang.daily?.[d] ?? 0),
      labels: days.map((d) => WEEKDAY[new Date(`${d}T12:00:00`).getDay()]),
    };
  }, [lang.daily]);
  const weekXp = last14.values.slice(-7).reduce((a, b) => a + b, 0);
  const activeDays = last14.values.filter(Boolean).length;

  const byMastery = useMemo(() => {
    const out: Record<Mastery, number> = { nueva: 0, aprendiendo: 0, consolidada: 0, dominada: 0 };
    for (const w of words) out[mastery(w)]++;
    return out;
  }, [words]);

  const next7 = useMemo(() => forecast(words, now, 7), [words, now]);
  const next7Labels = Array.from({ length: 7 }, (_, i) => (i === 0 ? "Hoy" : WEEKDAY[new Date(now + i * 86_400_000).getDay()]));

  const exercises = Object.entries(lang.exercises ?? {}).filter(([, e]) => e.total > 0);
  const totals = exercises.reduce((acc, [, e]) => ({ ok: acc.ok + e.ok, total: acc.total + e.total }), { ok: 0, total: 0 });
  const accuracy = totals.total ? Math.round((100 * totals.ok) / totals.total) : null;

  const hardest = useMemo(
    () =>
      words
        .filter((w) => w.wrong > 0)
        .sort((a, b) => b.wrong - b.correct - (a.wrong - a.correct) || (a.ease ?? 2.5) - (b.ease ?? 2.5))
        .slice(0, 8),
    [words]
  );

  const completed = Object.keys(lang.completed).length;

  if (!words.length && !lang.xp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <TrendingUp className="size-12 text-slate-300" />
        <h2 className="text-xl font-bold">Aún no hay estadísticas de {profile.language}</h2>
        <p className="max-w-sm text-slate-500">Completa tu primera lección o haz el test de nivel para empezar a ver tu progreso.</p>
        <button onClick={() => onGo("placement")} className="rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
          Hacer el test de nivel
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card Icon={Flame} label="Racha" value={`${progress.streak} ${progress.streak === 1 ? "día" : "días"}`} hint={`${activeDays} de los últimos 14 días`} color="text-orange-500" />
          <Card Icon={Zap} label="XP" value={String(lang.xp)} hint={`${weekXp} esta semana`} color="text-amber-500" />
          <Card Icon={BookOpen} label="Palabras" value={String(words.length)} hint={`${byMastery.dominada} dominadas`} color="text-sky-600" />
          <Card Icon={Target} label="Precisión" value={accuracy === null ? "—" : `${accuracy}%`} hint={totals.total ? `${totals.total} respuestas` : "sin datos aún"} color="text-brand-700" />
          <Card Icon={GraduationCap} label="Lecciones" value={`${completed}/${LESSON_ORDER.length}`} hint={`${Math.round((100 * completed) / LESSON_ORDER.length)}% del curso`} color="text-violet-600" />
          <Card
            Icon={TrendingUp}
            label="Nivel"
            value={lang.placement?.level ?? profile.level}
            hint={lang.placement ? `test del ${new Date(lang.placement.date).toLocaleDateString("es-ES")}` : "sin test de nivel"}
            color="text-rose-500"
          />
        </div>

        <section className="rounded-2xl border-2 border-slate-100 p-4">
          <h3 className="mb-3 font-bold">XP de los últimos 14 días</h3>
          <Bars values={last14.values} labels={last14.labels} highlight={13} color="bg-amber-400" />
        </section>

        <section className="rounded-2xl border-2 border-slate-100 p-4">
          <h3 className="mb-1 font-bold">Dominio del vocabulario</h3>
          <p className="mb-3 text-xs text-slate-500">
            Una palabra está «dominada» cuando su próximo repaso queda a 3 semanas o más.
          </p>
          {words.length > 0 && (
            <div className="flex h-4 overflow-hidden rounded-full">
              {(Object.keys(byMastery) as Mastery[]).map((m) =>
                byMastery[m] ? (
                  <div key={m} className={MASTERY_COLOR[m]} style={{ width: `${(byMastery[m] / words.length) * 100}%` }} title={`${MASTERY_LABEL[m]}: ${byMastery[m]}`} />
                ) : null
              )}
            </div>
          )}
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(Object.keys(byMastery) as Mastery[]).map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span className={`size-3 rounded-full ${MASTERY_COLOR[m]}`} />
                {MASTERY_LABEL[m]} <b className="ml-auto tabular-nums">{byMastery[m]}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border-2 border-slate-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Repasos de los próximos 7 días</h3>
            {next7[0] > 0 && (
              <button onClick={() => onGo("review")} className="rounded-full bg-sky-600 px-3 py-1 text-xs font-bold text-white">
                Repasar {next7[0]} ahora
              </button>
            )}
          </div>
          <Bars values={next7} labels={next7Labels} highlight={0} color="bg-sky-500" />
        </section>

        {exercises.length > 0 && (
          <section className="rounded-2xl border-2 border-slate-100 p-4">
            <h3 className="mb-3 font-bold">Precisión por tipo de ejercicio</h3>
            <ul className="space-y-2">
              {exercises
                .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)
                .map(([k, e]) => {
                  const pct = Math.round((100 * e.ok) / e.total);
                  return (
                    <li key={k} className="flex items-center gap-3 text-sm">
                      <span className="w-48 shrink-0 truncate sm:w-56">{EXERCISE_LABEL[k] ?? k}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${pct >= 80 ? "bg-brand-600" : pct >= 60 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right tabular-nums text-slate-500">
                        {pct}% · {e.total}
                      </span>
                    </li>
                  );
                })}
            </ul>
            <p className="mt-2 text-xs text-slate-400">Ordenado de menor a mayor: arriba está lo que más conviene practicar.</p>
          </section>
        )}

        {hardest.length > 0 && (
          <section className="rounded-2xl border-2 border-slate-100 p-4">
            <h3 className="mb-3 font-bold">Palabras que más te cuestan</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {hardest.map((w) => (
                <li key={w.word} className="flex items-center gap-3 py-2">
                  <span className="text-xl">{w.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <b>{w.word}</b> <span className="text-slate-500">· {w.translation}</span>
                  </span>
                  <span className="text-xs tabular-nums text-slate-500">
                    ✔ {w.correct} · ✘ {w.wrong}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] text-white ${MASTERY_COLOR[mastery(w)]}`}>{MASTERY_LABEL[mastery(w)]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(Object.keys(lang.media).length > 0 || lang.games.pairsBest !== undefined || lang.games.rushBest !== undefined) && (
          <section className="grid gap-3 sm:grid-cols-3">
            <Card Icon={BookOpen} label="Capítulos" value={String(Object.keys(lang.media).length)} hint="series y películas practicadas" color="text-slate-600" />
            <Card Icon={Zap} label="Parejas" value={lang.games.pairsBest !== undefined ? `${lang.games.pairsBest} s` : "—"} hint="mejor tiempo" color="text-slate-600" />
            <Card Icon={Zap} label="Contrarreloj" value={lang.games.rushBest !== undefined ? String(lang.games.rushBest) : "—"} hint="mejor puntuación" color="text-slate-600" />
          </section>
        )}
      </div>
    </div>
  );
}
