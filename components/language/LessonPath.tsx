"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Loader2, Lock, RotateCcw, Star, Target } from "lucide-react";
import LessonPlayer, { type LessonResult } from "@/components/language/LessonPlayer";
import PlacementTest from "@/components/language/PlacementTest";
import StatsBar from "@/components/language/StatsBar";
import { dueWords, nextDue } from "@/lib/srs";
import { LESSON_ORDER, LESSONS_PER_UNIT, UNITS, lessonKey, type Unit, type Word } from "@/lib/lessons";
import { speechCode, type Profile } from "@/lib/languages";
import { cacheGet, cacheSet, type ProgressApi } from "@/lib/progress";
import { shuffle } from "@/lib/similarity";

interface Active {
  key: string;
  title: string;
  words: Word[];
}

interface Props {
  profile: Profile;
  api: ProgressApi;
  /** Cambia el nivel del perfil (tras el test de nivel). */
  onLevelChange: (level: string) => void;
  /** Abre directamente el test de nivel. */
  startWithPlacement?: boolean;
  /** Avisa de que ya se abrió el test (para no reabrirlo al volver). */
  onPlacementOpened?: () => void;
}

/** "mañana", "en 3 días"… para el próximo repaso. */
function whenText(ts: number, now: number) {
  const days = Math.round((new Date(ts).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return `hoy a las ${new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

export default function LessonPath({ profile, api, onLevelChange, startWithPlacement = false, onPlacementOpened }: Props) {
  const { lang } = api;
  const [active, setActive] = useState<Active | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(LessonResult & { title: string }) | null>(null);
  const [placement, setPlacement] = useState(false);
  // Se fija al cargar para que la tarjeta no cambie a cada segundo.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (startWithPlacement) {
      setPlacement(true);
      onPlacementOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWithPlacement]);

  const known = useMemo(() => new Set(Object.keys(lang.words)), [lang.words]);
  // La primera lección no completada es la actual; las siguientes están bloqueadas.
  const currentIndex = LESSON_ORDER.findIndex((k) => !lang.completed[k]);
  const current = currentIndex === -1 ? LESSON_ORDER.length : currentIndex;

  // Repaso espaciado: las palabras que tocan hoy.
  const allWords = useMemo(() => Object.values(lang.words), [lang.words]);
  const due = useMemo(() => dueWords(allWords, Date.now(), 1000), [allWords]);
  const upcoming = useMemo(() => nextDue(allWords, now), [allWords, now]);

  /** Sesión de repaso: hasta 12 palabras pendientes, completadas hasta 4 para tener opciones. */
  function startReview() {
    const session = due.slice(0, 12);
    if (session.length < 4) {
      const extra = allWords
        .filter((w) => !session.includes(w))
        .sort((a, b) => a.lastSeen - b.lastSeen)
        .slice(0, 4 - session.length);
      session.push(...extra);
    }
    setActive({ key: "review", title: "🔁 Repaso del día", words: shuffle(session) });
  }

  async function start(unit: Unit, n: number) {
    const key = lessonKey(unit.id, n);
    const title = `${unit.emoji} ${unit.title} · Lección ${n}`;
    const cacheKey = `lingua-lesson:${profile.language}:${profile.level}:${key}`;
    const cached = cacheGet<Word[]>(cacheKey);
    if (cached?.length) {
      setActive({ key, title, words: cached });
      return;
    }
    setLoadingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lesson",
          topic: unit.topic,
          lesson: n,
          exclude: Object.keys(lang.words).slice(-120),
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      cacheSet(cacheKey, json.words);
      setActive({ key, title, words: json.words });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la lección");
    } finally {
      setLoadingKey(null);
    }
  }

  function finish(r: LessonResult) {
    if (!active) return;
    for (const a of r.answers) api.recordWord(a.word, a.correct, a.kind);
    api.addWords(active.words);
    if (active.key !== "review") api.completeLesson(active.key, r.stars);
    api.addXp(r.xp);
    setResult({ ...r, title: active.title });
    setActive(null);
  }

  if (placement) {
    return (
      <PlacementTest profile={profile} api={api} onClose={() => setPlacement(false)} onApplyLevel={onLevelChange} />
    );
  }

  if (active) {
    return (
      <LessonPlayer
        title={active.title}
        words={active.words}
        known={known}
        lang={speechCode(profile.language)}
        onExit={() => setActive(null)}
        onFinish={finish}
      />
    );
  }

  if (result) {
    const correct = result.answers.filter((a) => a.correct).length;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-3xl font-extrabold text-amber-500">¡Lección completada!</h2>
        <p className="text-slate-500">{result.title}</p>
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <Star
              key={s}
              className={`size-10 ${s <= result.stars ? "text-amber-400" : "text-slate-200"}`}
              fill="currentColor"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-amber-300 px-6 py-3">
            <p className="text-xs font-bold uppercase text-amber-500">XP ganada</p>
            <p className="text-2xl font-extrabold">⚡ {result.xp}</p>
          </div>
          <div className="rounded-2xl border-2 border-brand-600 px-6 py-3">
            <p className="text-xs font-bold uppercase text-brand-700">Precisión</p>
            <p className="text-2xl font-extrabold">
              {result.answers.length ? Math.round((100 * correct) / result.answers.length) : 100}%
            </p>
          </div>
        </div>
        <button
          onClick={() => setResult(null)}
          className="rounded-2xl bg-brand-600 px-10 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-xl space-y-6 py-4">
        <StatsBar api={api} />

        {!lang.placement && (
          <button
            onClick={() => setPlacement(true)}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 text-left hover:bg-violet-100"
          >
            <Target className="size-6 shrink-0 text-violet-600" />
            <span>
              <span className="block font-bold">¿Cuál es tu nivel de {profile.language}?</span>
              <span className="text-sm text-slate-600">Haz el test de nivel (4 min) y ajustamos las lecciones a ti.</span>
            </span>
          </button>
        )}

        {allWords.length > 0 &&
          (due.length > 0 ? (
            <button
              onClick={startReview}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-sky-200 bg-sky-50 p-4 text-left shadow-[0_3px_0] shadow-sky-200 hover:bg-sky-100"
            >
              <RotateCcw className="size-6 shrink-0 text-sky-600" />
              <span className="flex-1">
                <span className="block font-bold">Repaso del día</span>
                <span className="text-sm text-slate-600">
                  {due.length} {due.length === 1 ? "palabra toca" : "palabras tocan"} hoy. Repásalas antes de olvidarlas.
                </span>
              </span>
              <span className="rounded-full bg-sky-600 px-3 py-1 text-sm font-bold text-white">{due.length}</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-100 p-4">
              <CheckCircle2 className="size-6 shrink-0 text-brand-600" />
              <span className="text-sm">
                <span className="block font-bold">¡Repaso al día!</span>
                <span className="text-slate-500">
                  {upcoming ? `Próximo repaso ${whenText(upcoming, now)}.` : "Aprende palabras nuevas en las lecciones."}
                </span>
              </span>
            </div>
          ))}

        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

        {UNITS.map((unit, u) => (
          <section key={unit.id}>
            <div className="rounded-2xl bg-brand-600 p-4 text-white">
              <p className="text-xs font-bold uppercase opacity-80">Unidad {u + 1}</p>
              <h3 className="text-lg font-bold">
                {unit.emoji} {unit.title}
              </h3>
            </div>
            <div className="flex flex-col items-center gap-4 py-5">
              {Array.from({ length: LESSONS_PER_UNIT }, (_, i) => {
                const n = i + 1;
                const key = lessonKey(unit.id, n);
                const idx = LESSON_ORDER.indexOf(key);
                const stars = lang.completed[key];
                const isCurrent = idx === current;
                const locked = idx > current;
                // Zigzag como el camino de Duolingo.
                const offset = [0, 48, -48][(u + i) % 3];
                return (
                  <div key={key} style={{ transform: `translateX(${offset}px)` }} className="flex flex-col items-center">
                    <button
                      disabled={locked || loadingKey !== null}
                      onClick={() => start(unit, n)}
                      title={locked ? "Completa la lección anterior" : `Lección ${n}`}
                      className={`flex size-16 items-center justify-center rounded-full text-white transition active:translate-y-1 ${
                        locked
                          ? "bg-slate-200 text-slate-400"
                          : stars
                            ? "bg-amber-400 shadow-[0_5px_0_#d97706]"
                            : "bg-brand-600 shadow-[0_5px_0_#0d8b6c]"
                      } ${isCurrent ? "ring-4 ring-brand-100" : ""}`}
                    >
                      {loadingKey === key ? (
                        <Loader2 className="size-7 animate-spin" />
                      ) : locked ? (
                        <Lock className="size-6" />
                      ) : stars ? (
                        <Check className="size-8" strokeWidth={3} />
                      ) : (
                        <Star className="size-7" fill="currentColor" />
                      )}
                    </button>
                    <span className="mt-1 h-4 text-xs text-amber-500">
                      {stars ? "★".repeat(stars) : isCurrent ? <span className="font-bold text-brand-700">EMPEZAR</span> : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
