"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Loader2, Mic, MicOff, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { crossed, gapCorrect, gapIndexes, tokenize, type ClipQuiz, type ClipStop } from "@/lib/clipQuiz";
import { compareSpeech } from "@/lib/similarity";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";
import { useYouTubePlayer } from "@/lib/useYouTubePlayer";
import type { ProgressApi } from "@/lib/progress";
import type { VideoDTO } from "@/lib/types";

interface Props {
  video: VideoDTO;
  quiz: ClipQuiz;
  /** Código de voz del idioma (p. ej. en-US). */
  lang: string;
  api: ProgressApi;
  /** Clave del capítulo en el progreso (para «Repetir capítulos»). */
  mediaKey: string;
  mediaTitle: string;
  onExit: () => void;
}

const HEADINGS: Record<ClipStop["kind"], { title: string; sub: string }> = {
  meaning: { title: "Adivina el significado", sub: "Expresión" },
  gap: { title: "Mira y completa el hueco", sub: "Escucha" },
  speak: { title: "Repite la frase", sub: "Pronunciación" },
};

const SPEAK_PASS = 70;

/**
 * Clip con paradas: el vídeo se detiene después de ciertas frases y pregunta su
 * significado, pide completar palabras o repetirlas en voz alta.
 */
export default function VideoQuiz({ video, quiz, lang, api, mediaKey, mediaTitle, onExit }: Props) {
  const { ref, player, ready, playing, error } = useYouTubePlayer(video.id);
  const stops = quiz.stops;
  const [active, setActive] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [checked, setChecked] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hint, setHint] = useState(false);
  // Respuestas del ejercicio activo.
  const [choice, setChoice] = useState<number | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [heard, setHeard] = useState("");
  const [recorded, setRecorded] = useState(false);
  const { speak } = useSpeechSynthesis(lang);
  const rec = useSpeechRecognition(lang, (t) => setHeard(t));
  const lastTime = useRef(0);
  const finishedRef = useRef(false);

  const stop = active !== null ? stops[active] : null;
  const done = Object.keys(results).length;
  const correct = Object.values(results).filter(Boolean).length;
  const allDone = done === stops.length;
  const gapIdx = stop?.kind === "gap" ? gapIndexes(stop.quote, stop.hidden ?? []) : [];

  // Vigila el tiempo del vídeo y lo pausa al terminar cada frase con ejercicio.
  const activeRef = useRef(active);
  activeRef.current = active;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const now = p.getCurrentTime();
      const prev = lastTime.current;
      lastTime.current = now;
      const i = stops.findIndex(
        (s, j) => (j === activeRef.current || !(j in resultsRef.current)) && crossed(prev, now, s.time)
      );
      if (i >= 0) {
        p.pauseVideo();
        if (i !== activeRef.current) openStop(i);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stops]);

  useEffect(() => {
    player.current?.setPlaybackRate(slow ? 0.75 : 1);
  }, [slow, ready, player]);

  // Al completar todas las paradas se guarda el resultado del capítulo.
  useEffect(() => {
    if (!allDone || finishedRef.current || !stops.length) return;
    finishedRef.current = true;
    api.recordMedia(mediaKey, mediaTitle, Math.round((correct / stops.length) * 100));
    api.addXp(5);
  }, [allDone, correct, stops.length, api, mediaKey, mediaTitle]);

  function openStop(i: number) {
    setActive(i);
    setChecked(i in resultsRef.current);
    setHint(false);
    setChoice(null);
    setGaps([]);
    setHeard("");
    setRecorded(false);
  }

  function play() {
    player.current?.playVideo();
  }

  /** Vuelve a reproducir la frase actual (se detiene sola al terminar). */
  function replay(s: ClipStop) {
    const p = player.current;
    if (!p) return;
    p.seekTo(Math.max(0, s.start - 0.4), true);
    lastTime.current = Math.max(0, s.start - 0.4);
    p.playVideo();
  }

  function jumpTo(i: number) {
    openStop(i);
    replay(stops[i]);
  }

  function check() {
    if (!stop || active === null) return;
    let ok = false;
    if (stop.kind === "meaning") ok = choice === stop.answer;
    else if (stop.kind === "gap") {
      const tokens = tokenize(stop.quote);
      ok = gapIdx.every((ti, k) => gapCorrect(gaps[k] ?? "", tokens[ti]));
    } else ok = compareSpeech(stop.quote, heard).score >= SPEAK_PASS;
    setChecked(true);
    if (!(active in results)) {
      setResults((r) => ({ ...r, [active]: ok }));
      if (ok) api.addXp(3);
    }
  }

  function next() {
    setActive(null);
    setChecked(false);
    play();
  }

  const canCheck =
    !!stop &&
    !checked &&
    (stop.kind === "meaning" ? choice !== null : stop.kind === "gap" ? gapIdx.every((_, k) => (gaps[k] ?? "").trim()) : !!heard);
  const ok = active !== null ? results[active] : undefined;
  const speakScore = stop?.kind === "speak" && heard ? compareSpeech(stop.quote, heard) : null;

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-[28px] bg-slate-50 shadow-sm ring-1 ring-slate-200">
      {/* Vídeo */}
      <div className="relative bg-black">
        <div ref={ref} className="aspect-video w-full [&>iframe]:size-full" />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70">
            <Loader2 className="size-8 animate-spin" />
          </div>
        )}
        <button
          onClick={onExit}
          className="absolute left-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
          aria-label="Cerrar clip"
        >
          <X className="size-4" />
        </button>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between">
          <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
            <Play className="size-3" fill="currentColor" /> {active !== null ? active + 1 : done}/{stops.length}
          </span>
          <span className="pointer-events-auto flex overflow-hidden rounded-lg bg-white/85 text-xs font-semibold">
            <button onClick={() => setSlow(false)} className={`px-2.5 py-1 ${!slow ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>
              Normal
            </button>
            <button onClick={() => setSlow(true)} className={`px-2.5 py-1 ${slow ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>
              Lento
            </button>
          </span>
        </div>
      </div>

      {/* Paradas */}
      <div className="flex gap-1.5 px-4 pt-3" aria-label="Paradas del clip">
        {stops.map((s, i) => (
          <button
            key={i}
            onClick={() => jumpTo(i)}
            title={`${HEADINGS[s.kind].title} · ${Math.round(s.time)} s`}
            className={`h-1.5 flex-1 rounded-full ${
              i === active ? "bg-slate-800" : i in results ? (results[i] ? "bg-brand-600" : "bg-rose-400") : "bg-slate-200"
            }`}
            aria-label={`Ir a la parada ${i + 1}`}
          />
        ))}
      </div>

      <div className="min-h-[260px] space-y-4 p-5">
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {!stop && !allDone && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-500">{quiz.summary}</p>
            <p className="font-semibold">Mira el clip: se detendrá en {stops.length} momentos para preguntarte.</p>
            <button
              onClick={() => (playing ? player.current?.pauseVideo() : play())}
              disabled={!ready}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c] disabled:opacity-50"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" fill="currentColor" />}
              {playing ? "Pausar" : done ? "Seguir viendo" : "Ver el clip"}
            </button>
          </div>
        )}

        {!stop && allDone && (
          <div className="space-y-3 text-center">
            <div className="text-4xl">🎬</div>
            <p className="text-lg font-bold">¡Clip completado!</p>
            <p className="text-slate-600">
              {correct} de {stops.length} correctas · +{correct * 3 + 5} XP
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  setResults({});
                  resultsRef.current = {};
                  finishedRef.current = false;
                  jumpTo(0);
                }}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 font-bold"
              >
                <RotateCcw className="size-4" /> Repetir
              </button>
              <button onClick={onExit} className="rounded-2xl bg-brand-600 px-5 py-2.5 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
                Elegir otro clip
              </button>
            </div>
          </div>
        )}

        {stop && (
          <>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold">{HEADINGS[stop.kind].title}</h3>
                <p className="text-sm text-slate-500">
                  {HEADINGS[stop.kind].sub}
                  {stop.kind === "meaning" && stop.expression ? ` | ${stop.expression}` : ""}
                </p>
              </div>
              <button
                onClick={() => setHint((v) => !v)}
                className={`rounded-full p-2 ${hint ? "bg-rose-100 text-rose-600" : "bg-white text-rose-400 shadow-sm"}`}
                aria-label="Pista"
                title="Pista"
              >
                <Lightbulb className="size-5" />
              </button>
            </div>

            {hint && (
              <p className="rounded-xl bg-white p-3 text-sm text-slate-600">
                💡 {stop.tip || stop.translation}
                {stop.kind !== "meaning" && stop.tip && <span className="mt-1 block text-slate-400">{stop.translation}</span>}
              </p>
            )}

            {stop.kind === "meaning" && (
              <>
                <p className="text-sm italic text-slate-500">“{stop.quote}”</p>
                <div className="space-y-2">
                  {stop.options!.map((o, i) => {
                    const sel = choice === i;
                    const state = checked
                      ? i === stop.answer
                        ? "bg-brand-600 text-white"
                        : sel
                          ? "bg-rose-500 text-white"
                          : "bg-white opacity-60"
                      : sel
                        ? "bg-sky-600 text-white"
                        : "bg-white hover:bg-sky-50";
                    return (
                      <button
                        key={i}
                        disabled={checked}
                        onClick={() => setChoice(i)}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] shadow-sm ${state}`}
                      >
                        <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${sel || (checked && i === stop.answer) ? "bg-white text-sky-700" : "border-2 border-slate-200"}`}>
                          {(sel || (checked && i === stop.answer)) && <Check className="size-3.5" />}
                        </span>
                        {o}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {stop.kind === "gap" && (
              <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2 text-lg">
                {tokenize(stop.quote).map((t, ti) => {
                  const k = gapIdx.indexOf(ti);
                  if (k < 0) return <span key={ti}>{t}</span>;
                  const good = checked && gapCorrect(gaps[k] ?? "", t);
                  return checked ? (
                    <span key={ti} className={`rounded px-1 font-semibold ${good ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-700"}`}>
                      {good ? t : `${gaps[k] || "—"} → ${t}`}
                    </span>
                  ) : (
                    <input
                      key={ti}
                      value={gaps[k] ?? ""}
                      onChange={(e) => setGaps((g) => Object.assign([...g], { [k]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && canCheck && check()}
                      aria-label={`Palabra ${k + 1}`}
                      autoFocus={k === 0}
                      style={{ width: `${Math.max(3, t.length + 1)}ch` }}
                      className="border-b-2 border-slate-400 bg-transparent px-0.5 text-center font-semibold outline-none focus:border-sky-600"
                    />
                  );
                })}
              </p>
            )}

            {stop.kind === "speak" && (
              <div className="space-y-3">
                <p className="text-lg font-semibold">
                  {speakScore
                    ? speakScore.words.map((w, i) => (
                        <span key={i} className={w.ok ? "text-brand-700" : "text-rose-500 underline"}>
                          {w.word}{" "}
                        </span>
                      ))
                    : stop.quote}
                </p>
                {!checked && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setRecorded(true);
                        if (rec.listening) rec.stop();
                        else rec.start();
                      }}
                      disabled={!rec.supported}
                      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50 ${
                        rec.listening ? "animate-pulse bg-rose-500" : "bg-sky-600"
                      }`}
                    >
                      {rec.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                      {rec.listening ? "Detener" : recorded ? "Otra vez" : "Hablar"}
                    </button>
                    <button onClick={() => speak(stop.quote, 0.7)} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm">
                      <Volume2 className="size-4" /> Lento
                    </button>
                    {rec.listening && <span className="text-sm text-rose-500">{rec.interim || "Escuchando…"}</span>}
                  </div>
                )}
                {!rec.supported && <p className="text-sm text-amber-700">Tu navegador no reconoce voz (usa Chrome o Edge). Puedes saltar esta parada.</p>}
                {rec.error && <p className="text-sm text-rose-600">{rec.error}</p>}
              </div>
            )}

            {checked && (
              <div className={`rounded-xl p-3 text-sm ${ok ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-700"}`}>
                <b>{ok ? "¡Correcto! " : stop.kind === "speak" ? `Casi (${speakScore?.score ?? 0}/100). ` : "No es correcta. "}</b>
                <span className="text-slate-600">
                  “{stop.quote}” — {stop.translation}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => replay(stop)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm"
                title="Volver a oír la frase en el vídeo"
              >
                <RotateCcw className="size-4" /> Repetir fragmento
              </button>
              {!checked && stop.kind === "speak" && (
                <button
                  onClick={() => {
                    setChecked(true);
                    if (active !== null && !(active in results)) setResults((r) => ({ ...r, [active]: false }));
                  }}
                  className="text-sm font-semibold text-slate-400 hover:text-slate-600"
                >
                  Saltar
                </button>
              )}
              {checked ? (
                <button onClick={next} className="ml-auto rounded-xl bg-rose-500 px-6 py-2.5 font-bold text-white hover:bg-rose-600">
                  Continuar
                </button>
              ) : (
                <button
                  onClick={check}
                  disabled={!canCheck}
                  className="ml-auto rounded-xl bg-rose-500 px-6 py-2.5 font-bold text-white hover:bg-rose-600 disabled:opacity-40"
                >
                  Comprobar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
