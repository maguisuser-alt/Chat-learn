"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Timer, Trophy, Zap } from "lucide-react";
import StatsBar from "@/components/language/StatsBar";
import { Pairs } from "@/components/language/LessonPlayer";
import type { Word } from "@/lib/lessons";
import { speechCode, type Profile } from "@/lib/languages";
import { cacheGet, cacheSet, type ProgressApi } from "@/lib/progress";
import { shuffle } from "@/lib/similarity";
import { useSpeechSynthesis } from "@/lib/useSpeech";

type Game = "menu" | "pairs" | "rush";
const RUSH_SECONDS = 60;
const MIN_WORDS = 8;

export default function Games({ profile, api }: { profile: Profile; api: ProgressApi }) {
  const lang = speechCode(profile.language);
  const { speak } = useSpeechSynthesis(lang);
  const [game, setGame] = useState<Game>("menu");
  const [extra, setExtra] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const learned = useMemo(() => Object.values(api.lang.words), [api.lang.words]);
  const pool = useMemo(() => {
    const seen = new Set(learned.map((w) => w.word));
    return [...learned, ...extra.filter((w) => !seen.has(w.word))];
  }, [learned, extra]);

  // Si aún hay pocas palabras aprendidas, se piden palabras básicas a la IA (una vez, con caché).
  useEffect(() => {
    if (learned.length >= MIN_WORDS) return;
    const key = `lingua-game-words:${profile.language}:${profile.level}`;
    const cached = cacheGet<Word[]>(key);
    if (cached?.length) {
      setExtra(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "lesson",
        topic: "vocabulario básico y muy frecuente de la vida diaria",
        language: profile.language,
        level: profile.level,
        provider: profile.provider,
      }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Error");
        if (!cancelled) {
          cacheSet(key, j.words);
          setExtra(j.words);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [learned.length, profile.language, profile.level, profile.provider]);

  if (game === "pairs") return <PairsGame pool={pool} api={api} speak={speak} onExit={() => setGame("menu")} />;
  if (game === "rush") return <RushGame pool={pool} api={api} speak={speak} onExit={() => setGame("menu")} />;

  const ready = pool.length >= 4;
  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-xl space-y-5 py-4">
        <StatsBar api={api} />
        <p className="text-sm text-slate-500">
          {learned.length >= MIN_WORDS
            ? `Juegas con tus ${learned.length} palabras aprendidas.`
            : "Juegas con vocabulario básico hasta que aprendas más palabras en las lecciones."}
        </p>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Preparando palabras…
          </p>
        )}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

        <button
          disabled={!ready}
          onClick={() => setGame("pairs")}
          className="flex w-full items-center gap-4 rounded-3xl border-2 border-slate-200 p-5 text-left shadow-[0_4px_0] shadow-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-3xl">🧩</span>
          <span className="flex-1">
            <span className="block text-lg font-bold">Parejas contra reloj</span>
            <span className="text-sm text-slate-500">Une 6 palabras con su traducción lo más rápido posible</span>
          </span>
          {api.lang.games.pairsBest !== undefined && (
            <span className="text-sm font-bold text-amber-500">🏆 {api.lang.games.pairsBest}s</span>
          )}
        </button>

        <button
          disabled={!ready}
          onClick={() => setGame("rush")}
          className="flex w-full items-center gap-4 rounded-3xl border-2 border-slate-200 p-5 text-left shadow-[0_4px_0] shadow-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-3xl">⚡</span>
          <span className="flex-1">
            <span className="block text-lg font-bold">Contrarreloj</span>
            <span className="text-sm text-slate-500">{RUSH_SECONDS} segundos para acertar todas las traducciones que puedas</span>
          </span>
          {api.lang.games.rushBest !== undefined && (
            <span className="text-sm font-bold text-amber-500">🏆 {api.lang.games.rushBest}</span>
          )}
        </button>
      </div>
    </div>
  );
}

interface GameProps {
  pool: Word[];
  api: ProgressApi;
  speak: (t: string, rate?: number) => void;
  onExit: () => void;
}

/** Segundos transcurridos; vuelve a 0 cuando cambia `resetKey`. */
function useElapsed(running: boolean, resetKey: number) {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = Date.now();
    setStart(t);
    setNow(t);
  }, [resetKey]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);
  return Math.max(0, Math.floor((now - start) / 1000));
}

function EndScreen({
  emoji,
  title,
  detail,
  record,
  onAgain,
  onExit,
}: {
  emoji: string;
  title: string;
  detail: string;
  record: boolean;
  onAgain: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl">{emoji}</div>
      <h2 className="text-3xl font-extrabold">{title}</h2>
      <p className="text-lg text-slate-600">{detail}</p>
      {record && (
        <p className="flex items-center gap-2 font-bold text-amber-500">
          <Trophy className="size-5" /> ¡Nuevo récord!
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onExit} className="rounded-2xl border-2 border-slate-200 px-5 py-3 font-bold">
          Salir
        </button>
        <button
          onClick={onAgain}
          className="rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
        >
          Jugar otra vez
        </button>
      </div>
    </div>
  );
}

function PairsGame({ pool, api, speak, onExit }: GameProps) {
  const [round, setRound] = useState(0);
  const words = useMemo(() => shuffle(pool).slice(0, 6), [pool, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState<null | { seconds: number; mistakes: number; record: boolean }>(null);
  const elapsed = useElapsed(!done, round);

  return done ? (
    <EndScreen
      emoji="🧩"
      title={`${done.seconds} segundos`}
      detail={`${done.mistakes} ${done.mistakes === 1 ? "error" : "errores"} · +10 XP`}
      record={done.record}
      onExit={onExit}
      onAgain={() => {
        setDone(null);
        setRound((r) => r + 1);
      }}
    />
  ) : (
    <div className="h-full overflow-y-auto px-4">
      <div className="mx-auto max-w-xl space-y-4 py-4">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="text-sm font-semibold text-slate-500">
            ← Salir
          </button>
          <span className="flex items-center gap-1 font-bold text-sky-600">
            <Timer className="size-5" /> {elapsed}s
          </span>
        </div>
        <Pairs
          key={round}
          words={words}
          speak={speak}
          onDone={(mistakes) => {
            const seconds = elapsed + mistakes * 2; // cada error suma 2 s
            const prev = api.lang.games.pairsBest;
            api.setGameBest("pairsBest", seconds);
            api.addXp(10);
            setDone({ seconds, mistakes, record: prev === undefined || seconds < prev });
          }}
        />
        <p className="text-center text-xs text-slate-400">Cada error suma 2 segundos.</p>
      </div>
    </div>
  );
}

function RushGame({ pool, api, speak, onExit }: GameProps) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [left, setLeft] = useState(RUSH_SECONDS);
  const [question, setQuestion] = useState(() => makeQuestion(pool));
  const [flash, setFlash] = useState<null | "ok" | "bad">(null);
  const [end, setEnd] = useState<null | { record: boolean }>(null);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (end) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [end, round]);

  useEffect(() => {
    if (left > 0 || end) return;
    const final = scoreRef.current;
    const prev = api.lang.games.rushBest;
    api.setGameBest("rushBest", final);
    api.addXp(final);
    setEnd({ record: final > 0 && (prev === undefined || final > prev) });
  }, [left, end, api]);

  function answer(option: string) {
    if (end) return;
    const ok = option === question.word.translation;
    api.recordWord(question.word, ok, "rush");
    if (ok) {
      const nextCombo = combo + 1;
      const gained = nextCombo >= 5 ? 2 : 1; // racha de 5 aciertos: puntos dobles
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setCombo(nextCombo);
    } else {
      setCombo(0);
    }
    setFlash(ok ? "ok" : "bad");
    setTimeout(() => setFlash(null), 250);
    setQuestion(makeQuestion(pool, question.word.word));
  }

  if (end) {
    return (
      <EndScreen
        emoji="⚡"
        title={`${score} puntos`}
        detail={`+${score} XP`}
        record={end.record}
        onExit={onExit}
        onAgain={() => {
          scoreRef.current = 0;
          setScore(0);
          setCombo(0);
          setLeft(RUSH_SECONDS);
          setQuestion(makeQuestion(pool));
          setEnd(null);
          setRound((r) => r + 1);
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="mx-auto max-w-xl space-y-5 py-4">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="text-sm font-semibold text-slate-500">
            ← Salir
          </button>
          <span className="font-bold text-amber-500">
            <Zap className="inline size-5" /> {score}
            {combo >= 5 && <span className="ml-2 text-xs text-orange-500">🔥 x2</span>}
          </span>
          <span className={`flex items-center gap-1 font-bold ${left <= 10 ? "text-rose-500" : "text-sky-600"}`}>
            <Timer className="size-5" /> {left}s
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(left / RUSH_SECONDS) * 100}%` }} />
        </div>

        <button
          onClick={() => speak(question.word.word)}
          className={`w-full rounded-3xl border-2 p-8 text-center transition ${
            flash === "ok" ? "border-brand-600 bg-brand-50" : flash === "bad" ? "border-rose-400 bg-rose-50" : "border-slate-200"
          }`}
        >
          <div className="text-5xl">{question.word.emoji}</div>
          <div className="mt-2 text-3xl font-bold">{question.word.word}</div>
        </button>

        <div className="grid grid-cols-2 gap-3">
          {question.options.map((o) => (
            <button
              key={o}
              onClick={() => answer(o)}
              className="rounded-2xl border-2 border-slate-200 px-3 py-4 text-lg font-semibold shadow-[0_3px_0] shadow-slate-200 hover:bg-slate-50 active:translate-y-0.5"
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function makeQuestion(pool: Word[], avoid?: string) {
  const candidates = pool.length > 1 ? pool.filter((w) => w.word !== avoid) : pool;
  const word = candidates[Math.floor(Math.random() * candidates.length)];
  const others = shuffle(pool.filter((w) => w.translation !== word.translation)).slice(0, 3);
  return { word, options: shuffle([word.translation, ...others.map((w) => w.translation)]) };
}
