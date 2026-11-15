"use client";

import { useState } from "react";
import { Clapperboard, Eye, EyeOff, Loader2, Mic, MicOff, RotateCcw, Volume2 } from "lucide-react";
import VideoGrid from "@/components/VideoGrid";
import StatsBar from "@/components/language/StatsBar";
import type { Word } from "@/lib/lessons";
import { speechCode, type Profile } from "@/lib/languages";
import { cacheGet, cacheSet, type ProgressApi } from "@/lib/progress";
import { compareSpeech } from "@/lib/similarity";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";
import type { VideoDTO } from "@/lib/types";

interface Line {
  text: string;
  translation: string;
  context: string;
  tip: string;
}
interface MediaData {
  title: string;
  summary: string;
  lines: Line[];
  vocabulary: Word[];
  videos: VideoDTO[];
  searchUrl: string;
}

const SUGGESTIONS = [
  { title: "Friends", episode: "T1 E1" },
  { title: "The Office", episode: "T2 E1" },
  { title: "Stranger Things", episode: "T1 E1" },
  { title: "Toy Story", episode: "" },
  { title: "Harry Potter y la piedra filosofal", episode: "" },
];

const PASS = 70;

export default function MediaStudy({ profile, api }: { profile: Profile; api: ProgressApi }) {
  const lang = speechCode(profile.language);
  const [title, setTitle] = useState("");
  const [episode, setEpisode] = useState("");
  const [data, setData] = useState<MediaData | null>(null);
  const [mediaKey, setMediaKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del shadowing.
  const [lineIdx, setLineIdx] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [heard, setHeard] = useState("");
  const [hideText, setHideText] = useState(false);
  const [finished, setFinished] = useState(false);
  const [wordsAdded, setWordsAdded] = useState(false);

  const { speak } = useSpeechSynthesis(lang);
  const rec = useSpeechRecognition(lang, (t) => {
    setHeard(t);
    if (!data) return;
    const { score } = compareSpeech(data.lines[lineIdx].text, t);
    setScores((s) => {
      const next = [...s];
      next[lineIdx] = Math.max(next[lineIdx] ?? 0, score);
      return next;
    });
    if (score >= PASS) api.addXp(2);
  });

  function restart() {
    setLineIdx(0);
    setScores([]);
    setHeard("");
    setFinished(false);
  }

  async function load(t: string, ep: string) {
    const name = t.trim();
    if (!name || loading) return;
    setTitle(name);
    setEpisode(ep);
    const key = `${profile.language}:${profile.level}:${name.toLowerCase()}:${ep.trim().toLowerCase()}`;
    const cacheKey = `lingua-media:${key}`;
    restart();
    setWordsAdded(false);
    const cached = cacheGet<MediaData>(cacheKey);
    if (cached) {
      setData(cached);
      setMediaKey(key);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "media",
          title: name,
          episode: ep.trim() || undefined,
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      cacheSet(cacheKey, json);
      setData(json);
      setMediaKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar el capítulo");
    } finally {
      setLoading(false);
    }
  }

  function nextLine() {
    if (!data) return;
    setHeard("");
    if (lineIdx + 1 >= data.lines.length) {
      const avg = Math.round(
        data.lines.reduce((sum, _, i) => sum + (scores[i] ?? 0), 0) / data.lines.length
      );
      api.recordMedia(mediaKey, data.title, avg);
      api.addXp(10);
      setFinished(true);
      return;
    }
    setLineIdx(lineIdx + 1);
  }

  const recent = Object.entries(api.lang.media)
    .filter(([key]) => key.startsWith(`${profile.language}:${profile.level}:`))
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, 5);

  const line = data?.lines[lineIdx];
  const score = scores[lineIdx];
  const diff = line && heard ? compareSpeech(line.text, heard).words : null;
  const stat = mediaKey ? api.lang.media[mediaKey] : undefined;

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-3xl space-y-5 py-4">
        <StatsBar api={api} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(title, episode);
          }}
          className="flex flex-wrap gap-2 rounded-[28px] bg-[#f4f4f4] p-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Serie o película (ej. Friends)"
            className="min-w-[180px] flex-1 bg-transparent px-3 text-[15px] outline-none"
          />
          <input
            value={episode}
            onChange={(e) => setEpisode(e.target.value)}
            placeholder="Capítulo (ej. T1 E1)"
            className="w-36 rounded-full bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
            Estudiar
          </button>
        </form>

        {!data && !loading && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => load(s.title, s.episode)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                >
                  🎬 {s.title} {s.episode}
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Repetir capítulos</h3>
                <ul className="space-y-1.5">
                  {recent.map(([key, m]) => {
                    // Clave: idioma:nivel:nombre:capítulo (nombre y capítulo en minúsculas).
                    const [, , name, ep] = key.split(":");
                    return (
                      <li key={key}>
                        <button
                          onClick={() => load(name ?? m.title, ep ?? "")}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium">{m.title}</span>
                          <span className="text-xs text-slate-500">
                            {m.reps} {m.reps === 1 ? "vez" : "veces"} · mejor {m.best}/100
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Preparando el capítulo y buscando escenas…</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

        {data && !loading && (
          <div className="space-y-6">
            <section>
              <h2 className="text-xl font-bold">🎬 {data.title}</h2>
              <p className="mt-1 text-[15px] text-slate-600">{data.summary}</p>
              {stat && (
                <p className="mt-1 text-xs text-slate-500">
                  Practicado {stat.reps} {stat.reps === 1 ? "vez" : "veces"} · mejor puntuación {stat.best}/100
                </p>
              )}
            </section>

            {data.videos.length > 0 && (
              <VideoGrid videos={data.videos} searchUrl={data.searchUrl} title="Mira las escenas" />
            )}

            {/* Shadowing: escuchar y repetir frase a frase */}
            <section className="rounded-3xl border-2 border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Repite las frases</h3>
                <button
                  onClick={() => setHideText((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                  title="Reto de escucha: oculta el texto"
                >
                  {hideText ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {hideText ? "Texto oculto" : "Texto visible"}
                </button>
              </div>

              {finished ? (
                <div className="space-y-3 py-4 text-center">
                  <div className="text-5xl">🏆</div>
                  <p className="text-xl font-bold">¡Capítulo completado!</p>
                  <p className="text-slate-500">
                    Puntuación media:{" "}
                    <b>
                      {Math.round(
                        data.lines.reduce((s, _, i) => s + (scores[i] ?? 0), 0) / data.lines.length
                      )}
                      /100
                    </b>
                  </p>
                  <button
                    onClick={restart}
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
                  >
                    <RotateCcw className="size-4" /> Repetir capítulo
                  </button>
                </div>
              ) : (
                line && (
                  <div className="space-y-4">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-brand-600 transition-all"
                        style={{ width: `${(lineIdx / data.lines.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Frase {lineIdx + 1} de {data.lines.length} · {line.context}
                    </p>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      {hideText && !heard ? (
                        <p className="text-lg italic text-slate-400">Escucha la frase y repítela…</p>
                      ) : diff ? (
                        <p className="text-xl font-semibold">
                          {diff.map((w, i) => (
                            <span key={i} className={w.ok ? "text-brand-700" : "text-rose-500 underline"}>
                              {w.word}{" "}
                            </span>
                          ))}
                        </p>
                      ) : (
                        <p className="text-xl font-semibold">{line.text}</p>
                      )}
                      {(!hideText || heard) && <p className="mt-1 text-sm text-slate-500">{line.translation}</p>}
                      <p className="mt-2 text-xs text-slate-500">💡 {line.tip}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={() => speak(line.text)}
                        className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-4 py-2 font-semibold hover:bg-slate-50"
                      >
                        <Volume2 className="size-4" /> Escuchar
                      </button>
                      <button
                        onClick={() => speak(line.text, 0.6)}
                        className="rounded-xl border-2 border-slate-200 px-4 py-2 font-semibold hover:bg-slate-50"
                      >
                        🐢 Lento
                      </button>
                      <button
                        onClick={rec.listening ? rec.stop : rec.start}
                        disabled={!rec.supported}
                        className={`flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50 ${
                          rec.listening ? "animate-pulse bg-rose-500" : "bg-brand-600 shadow-[0_3px_0_#0d8b6c]"
                        }`}
                      >
                        {rec.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                        {rec.listening ? "Detener" : "Repetir"}
                      </button>
                    </div>
                    {rec.listening && <p className="text-center text-sm text-rose-500">{rec.interim || "Escuchando…"}</p>}
                    {rec.error && <p className="text-center text-sm text-rose-600">{rec.error}</p>}
                    {!rec.supported && (
                      <p className="text-center text-sm text-amber-700">
                        Tu navegador no reconoce voz (usa Chrome o Edge). Puedes escuchar y avanzar.
                      </p>
                    )}

                    {score !== undefined && (
                      <p className={`text-center text-lg font-bold ${score >= PASS ? "text-brand-700" : "text-amber-600"}`}>
                        {score >= PASS ? "¡Genial!" : "Casi, inténtalo otra vez"} · {score}/100
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        onClick={nextLine}
                        className="rounded-2xl bg-brand-600 px-6 py-2.5 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
                      >
                        {lineIdx + 1 >= data.lines.length ? "Terminar" : "Siguiente frase"}
                      </button>
                    </div>
                  </div>
                )
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">Vocabulario del capítulo</h3>
                <button
                  onClick={() => {
                    api.addWords(data.vocabulary);
                    setWordsAdded(true);
                  }}
                  disabled={wordsAdded}
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 disabled:opacity-60"
                >
                  {wordsAdded ? "✔ Añadidas a tus palabras" : "+ Añadir a mis palabras"}
                </button>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.vocabulary.map((w) => (
                  <li key={w.word}>
                    <button
                      onClick={() => speak(w.word)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                    >
                      <span className="text-2xl">{w.emoji}</span>
                      <span>
                        <span className="block font-semibold">{w.word}</span>
                        <span className="text-sm text-slate-500">{w.translation}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <button
              onClick={() => {
                setData(null);
                setTitle("");
                setEpisode("");
              }}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Elegir otra serie o película
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
