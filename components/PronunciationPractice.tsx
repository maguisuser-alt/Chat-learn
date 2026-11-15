"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { speechCode, type Profile } from "@/lib/languages";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";
import { useRecorder } from "@/lib/useRecorder";
import { blobToBase64, toWav16k } from "@/lib/audioWav";
import type { WordStatus } from "@/lib/pronunciation";

interface Phrase {
  text: string;
  translation: string;
  tip: string;
}
interface Evaluation {
  score: number;
  verdict: string;
  wordIssues: { word: string; heard: string; tip: string }[];
  encouragement: string;
  mode: "audio" | "text";
  heard?: string;
  words?: { word: string; status: WordStatus }[];
  fluency?: number;
  intonation?: string;
}

const WORD_STYLE: Record<WordStatus, string> = {
  ok: "bg-brand-50 text-brand-700",
  mejorable: "bg-amber-50 text-amber-700",
  mal: "bg-rose-50 text-rose-700",
  omitida: "bg-slate-100 text-slate-400 line-through",
};

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/pronunciation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Error");
  return json as T;
}

const scoreColor = (s: number) => (s >= 80 ? "text-green-600" : s >= 55 ? "text-amber-600" : "text-red-600");

export default function PronunciationPractice({ profile }: { profile: Profile }) {
  const lang = speechCode(profile.language);
  const [topic, setTopic] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [current, setCurrent] = useState(0);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState<"phrases" | "evaluate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const { speak, speaking } = useSpeechSynthesis(lang);
  const recorder = useRecorder();
  const heardRef = useRef("");

  const phrase = phrases[current];
  // Con grabadora se evalúa el audio; el reconocimiento del navegador solo da una pista.
  const rec = useSpeechRecognition(lang, (t) => {
    heardRef.current = t;
    setHeard(t);
    if (!recorder.supported) evaluateText(t);
  });
  const recListening = useRef(rec.listening);
  recListening.current = rec.listening;
  const active = recorder.recording || rec.listening;

  // Libera la grabación anterior al sustituirla o al salir.
  useEffect(() => () => void (recordingUrl && URL.revokeObjectURL(recordingUrl)), [recordingUrl]);

  // Al callarse, el reconocimiento termina solo: entonces también se para la grabación.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !rec.listening && recorder.recording) recorder.stop();
    wasListening.current = rec.listening;
  }, [rec.listening, recorder]);

  async function loadPhrases() {
    setLoading("phrases");
    setError(null);
    try {
      const data = await post<{ phrases: Phrase[] }>({
        action: "phrases",
        topic: topic || undefined,
        language: profile.language,
        level: profile.level,
        provider: profile.provider,
      });
      setPhrases(data.phrases);
      go(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function evaluateText(transcript: string) {
    if (!phrase) return;
    setLoading("evaluate");
    setError(null);
    try {
      setResult(
        await post<Evaluation>({
          action: "evaluate",
          target: phrase.text,
          transcript,
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  async function evaluateAudio(blob: Blob) {
    if (!phrase) return;
    setLoading("evaluate");
    setError(null);
    try {
      // Se espera un momento a que el reconocimiento entregue su texto (sirve de pista y de respaldo).
      for (let i = 0; i < 15 && recListening.current; i++) await new Promise((r) => setTimeout(r, 100));
      const wav = await toWav16k(blob);
      if (wav.size < 16_000 * 2 * 0.4) throw new Error("La grabación es demasiado corta. Mantén pulsado un poco más.");
      setResult(
        await post<Evaluation>({
          action: "evaluateAudio",
          target: phrase.text,
          audio: await blobToBase64(wav),
          transcript: heardRef.current,
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar la grabación");
    } finally {
      setLoading(null);
    }
  }

  async function toggle() {
    if (active) {
      rec.stop();
      recorder.stop();
      return;
    }
    setResult(null);
    setHeard("");
    heardRef.current = "";
    setError(null);
    if (!recorder.supported) {
      rec.start();
      return;
    }
    const pending = await recorder.start();
    if (!pending) return;
    if (rec.supported) rec.start();
    const blob = await pending;
    rec.stop();
    if (!blob) return;
    setRecordingUrl(URL.createObjectURL(blob));
    evaluateAudio(blob);
  }

  function go(i: number) {
    setCurrent(i);
    setHeard("");
    setResult(null);
    setRecordingUrl(null);
  }

  const canRecord = recorder.supported || rec.supported;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Tema opcional (viajes, trabajo, sonido th…)"
          className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm"
        />
        <button
          onClick={loadPhrases}
          disabled={loading !== null}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading === "phrases" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {phrases.length ? "Nuevas frases" : "Generar frases"}
        </button>
      </div>

      {!canRecord && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Tu navegador no permite grabar el micrófono. Usa Chrome, Edge, Firefox o Safari actualizados.
        </p>
      )}

      {phrase ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {phrases.map((p, i) => (
              <button
                key={p.text}
                onClick={() => go(i)}
                disabled={active}
                className={`size-8 rounded-full text-sm ${i === current ? "bg-brand-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-center">
            {result?.words?.length ? (
              <p className="flex flex-wrap justify-center gap-1 text-xl font-semibold">
                {result.words.map((w, i) => (
                  <span key={i} className={`rounded-md px-1.5 ${WORD_STYLE[w.status] ?? ""}`} title={w.status}>
                    {w.word}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-xl font-semibold">{phrase.text}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">{phrase.translation}</p>
            <p className="mt-2 text-xs text-slate-500">💡 {phrase.tip}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => speak(phrase.text)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                <Volume2 className={`size-4 ${speaking ? "text-brand-600" : ""}`} /> Escuchar
              </button>
              <button
                onClick={() => speak(phrase.text, 0.6)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                🐢 Lento
              </button>
              {recordingUrl && (
                <button
                  onClick={() => new Audio(recordingUrl).play().catch(() => {})}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
                >
                  <Play className="size-4" /> Mi grabación
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggle}
              disabled={!canRecord || loading !== null}
              className={`flex size-16 items-center justify-center rounded-full text-white disabled:opacity-50 ${
                active ? "animate-pulse bg-red-600" : "bg-brand-600 hover:bg-brand-700"
              }`}
              aria-label={active ? "Terminar" : "Grabar"}
            >
              {active ? <Square className="size-6" fill="currentColor" /> : <Mic className="size-6" />}
            </button>
            <p className="min-h-5 text-center text-sm text-slate-500">
              {active
                ? rec.interim || "Grabando… di la frase (se para solo al terminar)"
                : loading === "evaluate"
                  ? "Escuchando tu pronunciación…"
                  : heard
                    ? `Se oyó: “${heard}”`
                    : "Pulsa y di la frase"}
            </p>
            {(recorder.error || rec.error) && <p className="text-sm text-red-600">{recorder.error ?? rec.error}</p>}
          </div>

          {result && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Pronunciación</p>
                  <p className={`text-3xl font-bold ${scoreColor(result.score)}`}>{result.score}/100</p>
                </div>
                {typeof result.fluency === "number" && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Fluidez</p>
                    <p className={`text-2xl font-bold ${scoreColor(result.fluency)}`}>{result.fluency}/100</p>
                  </div>
                )}
                <span
                  className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    result.mode === "audio" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
                  }`}
                  title={result.mode === "audio" ? "La IA escuchó tu grabación" : "Gemini no estaba disponible: se comparó el texto reconocido"}
                >
                  <AudioLines className="size-3.5" />
                  {result.mode === "audio" ? "Analizado con tu audio" : "Evaluado con el texto reconocido"}
                </span>
              </div>
              <p>{result.verdict}</p>
              {result.heard && <p className="text-slate-500">La IA oyó: “{result.heard}”</p>}
              {result.intonation && <p className="text-slate-600">🎵 {result.intonation}</p>}
              {result.wordIssues.length > 0 && (
                <ul className="space-y-1">
                  {result.wordIssues.map((w, i) => (
                    <li key={`${w.word}-${i}`} className="rounded-md bg-slate-50 px-3 py-2">
                      <b>{w.word}</b> <span className="text-slate-500">(se oyó: {w.heard})</span>
                      <span className="block">{w.tip}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-slate-600">{result.encouragement}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={toggle} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  Repetir
                </button>
                {current < phrases.length - 1 && (
                  <button onClick={() => go(current + 1)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">
                    Siguiente frase
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Genera frases para tu nivel, escúchalas y repítelas. La IA escucha tu grabación y te dice qué sonidos mejorar.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
