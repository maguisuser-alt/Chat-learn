"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { speechCode, type Profile } from "@/lib/languages";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";

interface Props {
  profile: Profile;
  userId: string;
  /** Se llama cada vez que el estudiante envía un mensaje (para sumar XP). */
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

export default function VoiceConversation({ profile, userId, onUserMessage }: Props) {
  const lang = speechCode(profile.language);
  const [scenarioId, setScenarioId] = useState("");
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: `voice-${profile.language}-${scenarioId || "free"}`,
  });
  const { speak, cancel, speaking } = useSpeechSynthesis(lang);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [text, setText] = useState("");
  const spokenRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  function send(t: string, countXp = true) {
    const msg = t.trim();
    if (!msg || busy) return;
    cancel();
    sendMessage(
      { text: msg },
      {
        body: {
          mode: "conversation",
          userId,
          language: profile.language,
          level: profile.level,
          provider: profile.provider,
          scenario: scenario.prompt,
          conversationId,
        },
      }
    );
    if (countXp) onUserMessage?.();
    setText("");
  }

  const rec = useSpeechRecognition(lang, (t) => send(t));

  const messageText = (m: (typeof messages)[number]) =>
    m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

  // Lee en voz alta la respuesta del tutor cuando termina de llegar.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (status !== "ready" || !autoSpeak) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && spokenRef.current !== last.id) {
      spokenRef.current = last.id;
      // Quita la corrección entre paréntesis (está en español) para la voz.
      speak(messageText(last).replace(/\([^)]*\)\s*$/, ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, autoSpeak]);

  function toggleMic() {
    if (rec.listening) return rec.stop();
    cancel();
    rec.start();
  }

  function reset() {
    cancel();
    setMessages([]);
    spokenRef.current = null;
    setConversationId(crypto.randomUUID());
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-semibold">
          {scenario.emoji} {scenario.title} · {profile.language}
        </h2>
        <div className="flex gap-2 text-sm">
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
            <button onClick={reset} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">
              Cambiar escena
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Elige una situación y habla en {profile.language} con el micrófono. El tutor te responde con voz y
              corrige tus errores al final de cada mensaje.
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
            <button
              onClick={() =>
                send("Empecemos. Inicia tú la conversación con una frase y una pregunta sencilla.", false)
              }
              className="w-full rounded-2xl bg-brand-600 py-3 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
            >
              Empezar: {scenario.title}
            </button>
          </div>
        )}
        {messages.map((m, i) =>
          // El primer mensaje (instrucción de inicio) no se muestra.
          i === 0 && m.role === "user" && m.parts.some((p) => p.type === "text" && p.text.startsWith("Empecemos.")) ? null : (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap text-[15px] leading-7 ${
                  m.role === "user" ? "rounded-3xl bg-[#f4f4f4] px-4 py-2.5" : ""
                }`}
              >
                {messageText(m)}
                {m.role === "assistant" && (
                  <button
                    onClick={() => speak(messageText(m).replace(/\([^)]*\)\s*$/, ""))}
                    className="ml-2 inline align-middle text-slate-400 hover:text-brand-600"
                    aria-label="Escuchar"
                  >
                    <Volume2 className="inline size-4" />
                  </button>
                )}
              </div>
            </div>
          )
        )}
        {status === "submitted" && <p className="text-sm text-slate-400">Pensando…</p>}
        {error && <p className="text-sm text-red-600">No se pudo obtener respuesta: {error.message}</p>}
        <div ref={endRef} />
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-4">
        {rec.listening && (
          <p className="text-center text-sm text-red-600">{rec.interim || "Escuchando…"}</p>
        )}
        {rec.error && <p className="text-center text-sm text-red-600">{rec.error}</p>}
        {!rec.supported && (
          <p className="text-center text-sm text-amber-700">
            Sin reconocimiento de voz en este navegador (usa Chrome o Edge). Puedes escribir.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-center gap-2 rounded-[28px] bg-[#f4f4f4] p-1.5"
        >
          <button
            type="button"
            onClick={toggleMic}
            disabled={!rec.supported || busy}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50 ${
              rec.listening ? "animate-pulse bg-red-600" : "bg-brand-600 hover:bg-brand-700"
            }`}
            aria-label={rec.listening ? "Detener" : "Hablar"}
          >
            {rec.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={speaking ? "El tutor está hablando…" : "O escribe aquí…"}
            className="flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-slate-500"
          />
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
