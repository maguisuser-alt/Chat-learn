"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ChevronDown, Flag, Languages, Lightbulb, Loader2, Mic, Play, RotateCcw, Send, Square, Volume2, VolumeX } from "lucide-react";
import { speechCode, type Profile } from "@/lib/languages";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";
import { useRecorder } from "@/lib/useRecorder";
import { blobToBase64, toWav16k } from "@/lib/audioWav";
import { needsCorrection, speakable, summarize, type TurnFeedback } from "@/lib/talkCoach";

interface Props {
  profile: Profile;
  userId: string;
  /** Se llama cada vez que el estudiante habla o escribe (para sumar XP). */
  onUserMessage?: () => void;
}

const SCENARIOS = [
  { id: "", emoji: "💬", title: "Charla libre", prompt: "" },
  { id: "restaurant", emoji: "🍽️", title: "En el restaurante", prompt: "Eres camarero en un restaurante y el estudiante es un cliente que quiere pedir la comida." },
  { id: "airport", emoji: "✈️", title: "En el aeropuerto", prompt: "Eres empleado de facturación en un aeropuerto y el estudiante es un pasajero." },
  { id: "hotel", emoji: "🏨", title: "En el hotel", prompt: "Eres recepcionista de un hotel y el estudiante quiere registrarse o tiene un problema con su habitación." },
  { id: "interview", emoji: "💼", title: "Entrevista de trabajo", prompt: "Eres entrevistador de recursos humanos y el estudiante es candidato a un puesto." },
  { id: "doctor", emoji: "🩺", title: "En el médico", prompt: "Eres médico y el estudiante es un paciente que explica sus síntomas." },
  { id: "shopping", emoji: "🛍️", title: "De compras", prompt: "Eres dependiente de una tienda de ropa y el estudiante busca algo para comprar." },
  { id: "friends", emoji: "🧑‍🤝‍🧑", title: "Hacer amigos", prompt: "Eres una persona simpática que acaba de conocer al estudiante en una fiesta." },
];

const STARTER = "Empecemos. Inicia tú la conversación con una frase y una pregunta sencilla.";
const MIN_WAV_BYTES = 16_000 * 2 * 0.5; // medio segundo de voz

type Feedback = TurnFeedback | "loading" | { error: string };

async function postPron<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/pronunciation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "No se pudo analizar");
  return json as T;
}

const scoreColor = (s: number) => (s >= 80 ? "text-brand-700" : s >= 60 ? "text-amber-600" : "text-rose-600");
const WORD: Record<string, string> = { ok: "text-brand-700", mejorable: "text-amber-600 underline decoration-dotted", mal: "text-rose-600 underline" };

/** Repetir la versión correcta y comprobar la pronunciación al momento. */
function RepeatPractice({ target, profile, lang }: { target: string; profile: Profile; lang: string }) {
  const recorder = useRecorder(12_000);
  const rec = useSpeechRecognition(lang);
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [result, setResult] = useState<{ score: number; verdict: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === "rec" && !rec.listening && rec.supported) recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.listening]);

  async function go() {
    if (state === "rec") return recorder.stop();
    setError(null);
    setResult(null);
    const pending = await recorder.start();
    if (!pending) return;
    setState("rec");
    if (rec.supported) rec.start();
    const blob = await pending;
    rec.stop();
    if (!blob) return setState("idle");
    setState("busy");
    try {
      const wav = await toWav16k(blob);
      const r = await postPron<{ score: number; verdict: string }>({
        action: "evaluateAudio",
        target,
        audio: await blobToBase64(wav),
        language: profile.language,
        level: profile.level,
        provider: profile.provider,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar");
    } finally {
      setState("idle");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={go}
        disabled={state === "busy" || !recorder.supported}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white disabled:opacity-50 ${state === "rec" ? "animate-pulse bg-rose-500" : "bg-sky-600"}`}
      >
        {state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : state === "rec" ? <Square className="size-3" fill="currentColor" /> : <Mic className="size-3.5" />}
        {state === "rec" ? "Parar" : result ? "Otra vez" : "Practicar"}
      </button>
      {result && (
        <span className="text-xs">
          <b className={scoreColor(result.score)}>{result.score}/100</b> · {result.verdict}
        </span>
      )}
      {(error || recorder.error) && <span className="text-xs text-rose-600">{error ?? recorder.error}</span>}
    </span>
  );
}

/** Corrección de un turno: se muestra bajo el mensaje del estudiante sin cortar la charla. */
function FeedbackCard({ fb, profile, lang, speak }: { fb: Feedback; profile: Profile; lang: string; speak: (t: string, rate?: number) => void }) {
  const [open, setOpen] = useState(false);
  if (fb === "loading") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="size-3.5 animate-spin" /> Revisando tu pronunciación…
      </p>
    );
  }
  if ("error" in fb) return <p className="text-xs text-slate-400">Sin corrección: {fb.error}</p>;

  const fix = needsCorrection(fb);
  const audio = fb.mode === "audio" && typeof fb.score === "number";
  const label = audio
    ? `🎯 ${fb.score} pronunciación${fix ? " · 1 sugerencia" : ""}${fb.issues?.length ? ` · ${fb.issues.length} sonido${fb.issues.length > 1 ? "s" : ""}` : ""}`
    : fix
      ? "✏️ Hay una forma más natural"
      : "✅ ¡Bien dicho!";

  return (
    <div className="w-full max-w-[85%] self-end">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
          !fix && (!audio || fb.score! >= 80) ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
        }`}
        aria-expanded={open}
      >
        {label}
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
          {audio && fb.words?.length ? (
            <p className="text-[15px]">
              {fb.words.map((w, i) => (
                <span key={i} className={WORD[w.status] ?? ""}>
                  {w.word}{" "}
                </span>
              ))}
              {typeof fb.fluency === "number" && <span className="ml-1 text-xs text-slate-400">· fluidez {fb.fluency}</span>}
            </p>
          ) : null}
          {fix && (
            <div className="rounded-xl bg-sky-50 p-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Más natural</p>
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                {fb.better}
                <button onClick={() => speak(fb.better)} className="text-sky-700" aria-label="Escuchar">
                  <Volume2 className="size-4" />
                </button>
                <button onClick={() => speak(fb.better, 0.65)} className="text-xs text-sky-700" aria-label="Escuchar lento">
                  🐢
                </button>
              </p>
              {fb.grammar && <p className="mt-1 text-slate-600">{fb.grammar}</p>}
            </div>
          )}
          {fb.issues?.map((i, k) => (
            <p key={k}>
              <b className="text-rose-600">{i.word}</b> <span className="text-slate-600">— {i.tip}</span>
            </p>
          ))}
          {fb.praise && <p className="text-slate-500">👍 {fb.praise}</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">Repite la frase {fix ? "corregida" : ""}:</span>
            <RepeatPractice target={fix ? fb.better : fb.heard || fb.better} profile={profile} lang={lang} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Charla con el tutor (por voz o texto) y, a la vez, corrección de lo que dice
 * el estudiante: pronunciación (con su audio), gramática y forma más natural.
 * La conversación sigue su curso; la corrección aparece debajo de cada mensaje.
 */
export default function TalkCoach({ profile, userId, onUserMessage }: Props) {
  const lang = speechCode(profile.language);
  const [scenarioId, setScenarioId] = useState("");
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const { messages, sendMessage, status, error, setMessages } = useChat({ id: `talk-${profile.language}-${scenarioId || "free"}` });
  const { speak, cancel, speaking } = useSpeechSynthesis(lang);
  const recorder = useRecorder(25_000);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({});
  const [translations, setTranslations] = useState<Record<string, string | "loading">>({});
  const [suggestion, setSuggestion] = useState<string | "loading" | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const heardRef = useRef("");
  const spokenRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const rec = useSpeechRecognition(lang, (t) => {
    heardRef.current = t;
  });
  const listening = recorder.recording || rec.listening;

  const messageText = (m: (typeof messages)[number]) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const lastTutor = () => {
    const last = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
    return last ? speakable(messageText(last)).slice(0, 600) : "";
  };
  const userCount = () => messagesRef.current.filter((m) => m.role === "user").length;

  function send(t: string) {
    const msg = t.trim();
    if (!msg) return;
    cancel();
    setSuggestion(null);
    sendMessage(
      { text: msg },
      {
        body: {
          mode: "conversation",
          coach: true,
          userId,
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
          scenario: scenario.prompt,
          conversationId,
        },
      }
    );
  }

  /** Pide la corrección del turno `idx` (con audio si lo hay). */
  async function review(idx: number, transcript: string, wav?: Blob) {
    setFeedback((f) => ({ ...f, [idx]: "loading" }));
    try {
      const fb = await postPron<TurnFeedback>({
        action: "turn",
        audio: wav ? await blobToBase64(wav) : undefined,
        transcript,
        context: lastTutor(),
        language: profile.language,
        level: profile.level,
        provider: profile.provider,
      });
      setFeedback((f) => ({ ...f, [idx]: fb }));
      return fb;
    } catch (e) {
      setFeedback((f) => ({ ...f, [idx]: { error: e instanceof Error ? e.message : "No se pudo analizar" } }));
      return null;
    }
  }

  // Al callarse, el reconocimiento termina solo: entonces se para también la grabación.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !rec.listening && recorder.recording) recorder.stop();
    wasListening.current = rec.listening;
  }, [rec.listening, recorder]);

  async function talk() {
    if (listening) {
      rec.stop();
      recorder.stop();
      return;
    }
    if (busy || preparing) return;
    cancel();
    setNotice(null);
    heardRef.current = "";
    if (!recorder.supported) {
      // Sin grabadora: solo reconocimiento (la corrección será del texto).
      if (rec.supported) rec.start();
      return;
    }
    const pending = await recorder.start();
    if (!pending) return; // el error (permiso de micrófono…) ya se muestra
    if (rec.supported) rec.start();
    const blob = await pending;
    rec.stop();
    for (let i = 0; i < 15 && heardRef.current === "" && rec.listening; i++) await new Promise((r) => setTimeout(r, 100));
    if (!blob) return;
    setPreparing(true);
    try {
      const wav = await toWav16k(blob).catch(() => null);
      const transcript = heardRef.current.trim();
      const idx = userCount();
      if (transcript) {
        // La charla sigue al momento; la corrección llega en paralelo.
        send(transcript);
        onUserMessage?.();
        review(idx, transcript, wav && wav.size >= MIN_WAV_BYTES ? wav : undefined);
      } else if (wav && wav.size >= MIN_WAV_BYTES) {
        // Sin reconocimiento del navegador: la IA transcribe y luego se envía.
        const fb = await review(idx, "", wav);
        if (fb?.heard) {
          send(fb.heard);
          onUserMessage?.();
        } else setNotice("No se te oyó bien. Acércate al micrófono e inténtalo de nuevo.");
      } else setNotice("No se te oyó. Mantén pulsado un poco más o habla más alto.");
    } finally {
      setPreparing(false);
    }
  }

  // Con reconocimiento pero sin grabadora (raro): al terminar se envía el texto.
  useEffect(() => {
    if (recorder.supported || rec.listening || !heardRef.current) return;
    const t = heardRef.current;
    heardRef.current = "";
    const idx = userCount();
    send(t);
    onUserMessage?.();
    review(idx, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.listening]);

  function sendTyped() {
    const t = text.trim();
    if (!t || busy) return;
    const idx = userCount();
    send(t);
    onUserMessage?.();
    review(idx, t);
    setText("");
  }

  // Lee en voz alta la respuesta del tutor cuando termina de llegar.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (status !== "ready" || !autoSpeak) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && spokenRef.current !== last.id) {
      spokenRef.current = last.id;
      speak(speakable(messageText(last)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, autoSpeak]);

  async function translate(id: string, t: string) {
    if (translations[id]) return setTranslations(({ [id]: _, ...rest }) => rest);
    setTranslations((x) => ({ ...x, [id]: "loading" }));
    try {
      const r = await postPron<{ text: string }>({ action: "help", kind: "translate", text: speakable(t), language: profile.language, level: profile.level, provider: profile.provider });
      setTranslations((x) => ({ ...x, [id]: r.text }));
    } catch {
      setTranslations(({ [id]: _, ...rest }) => rest);
    }
  }

  async function suggest() {
    setSuggestion("loading");
    const recent = messagesRef.current
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Estudiante" : "Tutor"}: ${speakable(messageText(m))}`)
      .filter((l) => !l.includes(STARTER))
      .join("\n");
    try {
      const r = await postPron<{ text: string }>({ action: "help", kind: "suggest", text: recent || lastTutor(), language: profile.language, level: profile.level, provider: profile.provider });
      setSuggestion(r.text);
    } catch {
      setSuggestion(null);
      setNotice("No se pudo sugerir una respuesta ahora.");
    }
  }

  function reset() {
    cancel();
    setMessages([]);
    setFeedback({});
    setTranslations({});
    setSuggestion(null);
    setSummaryOpen(false);
    spokenRef.current = null;
    setConversationId(crypto.randomUUID());
  }

  const done = Object.values(feedback).filter((f): f is TurnFeedback => typeof f === "object" && !("error" in f));
  const summary = summarize(done);
  let userIdx = -1;

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-semibold">
          {scenario.emoji} {scenario.title} · {profile.language}
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => {
              setAutoSpeak((v) => !v);
              cancel();
            }}
            className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            Voz {autoSpeak ? "activada" : "silenciada"}
          </button>
          {messages.length > 0 && (
            <>
              <button
                onClick={() => setSummaryOpen(true)}
                disabled={!done.length}
                className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
              >
                <Flag className="size-4" /> Terminar
              </button>
              <button onClick={reset} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">
                Cambiar escena
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Habla en {profile.language} con tu tutor. La conversación sigue con naturalidad y, debajo de cada cosa que digas, verás cómo
              pronunciaste cada palabra, una forma más natural de decirlo y podrás repetirla.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id || "free"}
                  onClick={() => setScenarioId(s.id)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${
                    s.id === scenarioId ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="font-semibold">{s.title}</span>
                </button>
              ))}
            </div>
            <button onClick={() => send(STARTER)} className="w-full rounded-2xl bg-brand-600 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]">
              Empezar: {scenario.title}
            </button>
          </div>
        )}

        {messages.map((m) => {
          const t = messageText(m);
          if (m.role === "user") {
            userIdx++;
            if (t === STARTER) return null;
            const fb = feedback[userIdx];
            return (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[#f4f4f4] px-4 py-2.5 text-[15px]">{t}</div>
                {fb && <FeedbackCard fb={fb} profile={profile} lang={lang} speak={speak} />}
              </div>
            );
          }
          const tr = translations[m.id];
          return (
            <div key={m.id} className="max-w-[85%] space-y-1">
              <p className="whitespace-pre-wrap text-[15px] leading-7">{t}</p>
              <div className="flex gap-1 text-slate-400">
                <button onClick={() => speak(speakable(t))} className="rounded-full p-1 hover:bg-slate-100 hover:text-slate-700" aria-label="Escuchar" title="Escuchar">
                  <Volume2 className="size-4" />
                </button>
                <button onClick={() => speak(speakable(t), 0.65)} className="rounded-full px-1.5 text-xs hover:bg-slate-100" title="Escuchar lento">
                  🐢
                </button>
                <button onClick={() => translate(m.id, t)} className="rounded-full p-1 hover:bg-slate-100 hover:text-slate-700" aria-label="Traducir" title="Traducir al español">
                  {tr === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
                </button>
              </div>
              {tr && tr !== "loading" && <p className="text-sm text-slate-500">{tr}</p>}
            </div>
          );
        })}
        {status === "submitted" && <p className="text-sm text-slate-400">Pensando…</p>}
        {error && <p className="text-sm text-rose-600">No se pudo obtener respuesta: {error.message}</p>}

        {summaryOpen && (
          <section className="space-y-3 rounded-3xl border-2 border-brand-100 bg-brand-50 p-5">
            <h3 className="text-lg font-bold">Resumen de la charla</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white p-3">
                <p className="text-2xl font-bold">{summary.turns}</p>
                <p className="text-xs text-slate-500">intervenciones</p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className={`text-2xl font-bold ${summary.pronunciation !== null ? scoreColor(summary.pronunciation) : ""}`}>{summary.pronunciation ?? "—"}</p>
                <p className="text-xs text-slate-500">pronunciación</p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className="text-2xl font-bold">{summary.fluency ?? "—"}</p>
                <p className="text-xs text-slate-500">fluidez</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {summary.corrected
                ? `En ${summary.corrected} de ${summary.turns} intervenciones había una forma más natural de decirlo.`
                : "Todo lo que dijiste sonó natural. ¡Muy bien!"}
            </p>
            {summary.tricky.length > 0 && (
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Sonidos para practicar</p>
                {summary.tricky.map((w) => (
                  <p key={w.word}>
                    <button onClick={() => speak(w.word, 0.7)} className="font-bold text-rose-600 hover:underline">
                      {w.word}
                    </button>
                    {w.times > 1 && <span className="text-slate-400"> ×{w.times}</span>} <span className="text-slate-600">— {w.tip}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSummaryOpen(false)} className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-2 font-bold">
                Seguir hablando
              </button>
              <button onClick={reset} className="flex items-center gap-1.5 rounded-2xl bg-brand-600 px-5 py-2 font-bold text-white">
                <RotateCcw className="size-4" /> Nueva charla
              </button>
            </div>
          </section>
        )}
        <div ref={endRef} />
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-4">
        {suggestion && (
          <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm">
            <Lightbulb className="size-4 shrink-0 text-amber-600" />
            {suggestion === "loading" ? (
              <span className="text-slate-500">Pensando una respuesta…</span>
            ) : (
              <>
                <span className="flex-1">{suggestion}</span>
                <button onClick={() => speak(suggestion)} className="text-amber-700" aria-label="Escuchar sugerencia">
                  <Play className="size-4" />
                </button>
              </>
            )}
          </div>
        )}
        {listening && <p className="text-center text-sm text-rose-600">{rec.interim || "Te escucho… (se envía al terminar de hablar)"}</p>}
        {preparing && <p className="text-center text-sm text-slate-500">Procesando tu voz…</p>}
        {(notice || recorder.error || rec.error) && <p className="text-center text-sm text-rose-600">{notice ?? recorder.error ?? rec.error}</p>}
        {!recorder.supported && !rec.supported && (
          <p className="text-center text-sm text-amber-700">Este navegador no permite usar el micrófono. Puedes escribir.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendTyped();
          }}
          className="flex items-center gap-2 rounded-[28px] bg-[#f4f4f4] p-1.5"
        >
          <button
            type="button"
            onClick={talk}
            disabled={(!recorder.supported && !rec.supported) || ((busy || preparing) && !listening) || messages.length === 0}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50 ${
              listening ? "animate-pulse bg-rose-600" : "bg-brand-600 hover:bg-brand-700"
            }`}
            aria-label={listening ? "Terminar de hablar" : "Hablar"}
          >
            {listening ? <Square className="size-4" fill="currentColor" /> : <Mic className="size-5" />}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={messages.length === 0}
            placeholder={messages.length === 0 ? "Empieza la charla arriba" : speaking ? "El tutor está hablando…" : "O escribe aquí…"}
            className="flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-slate-500"
          />
          {messages.length > 0 && !text.trim() && (
            <button
              type="button"
              onClick={suggest}
              disabled={busy || suggestion === "loading"}
              className="flex size-10 items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 disabled:opacity-50"
              aria-label="Sugerir respuesta"
              title="¿No sabes qué decir? Pide una sugerencia"
            >
              <Lightbulb className="size-5" />
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="flex size-10 items-center justify-center rounded-full bg-black text-white disabled:bg-slate-300"
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
