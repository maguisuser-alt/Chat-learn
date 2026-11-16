"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import {
  ArrowUp,
  AudioLines,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Globe,
  ImageIcon,
  Layers,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Square,
  Telescope,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import Markdown from "@/components/Markdown";
import VideoGrid from "@/components/VideoGrid";
import ExportMenu from "@/components/ExportMenu";
import FeedbackButtons from "@/components/FeedbackButtons";
import ImageEditor from "@/components/ImageEditor";
import CameraCapture from "@/components/CameraCapture";
import StudyModal, { type StudyMode } from "@/components/study/StudyModal";
import type { DecksApi } from "@/lib/useDecks";
import { imageExtension } from "@/lib/imagePlan";
import type { Profile } from "@/lib/languages";
import type { ChatUIMessage, ResearchProgress } from "@/lib/types";
import type { ChatHistoryApi } from "@/lib/chatHistory";
import { chatContext, useSettings } from "@/lib/settings";
import { useReadAloud } from "@/lib/readAloud";
import { useSpeechRecognition } from "@/lib/useSpeech";

interface Props {
  profile: Profile;
  history: ChatHistoryApi;
  /** Abre Ajustes en una sección concreta. */
  onOpenSettings: (section?: string) => void;
  /** Mazos de tarjetas donde se guardan las creadas desde una respuesta. */
  decks: DecksApi;
  /** Abre la sección Tarjetas. */
  onOpenCards: () => void;
}

/** Modo especial del próximo mensaje. */
type Tool = "image" | "audio" | "deep" | null;

const STARTERS = [
  "¿Cómo funciona la fotosíntesis?",
  "Explícame las causas de la Revolución Francesa",
  "¿Qué es una derivada y para qué sirve?",
  "¿Cuál es la diferencia entre ADN y ARN?",
];

const MAX_FILES = 4;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|csv|json|xml|html?|css|js|ts|tsx|jsx|py|java|c|cpp|cs|sql|ya?ml)$/i;
const ACCEPT =
  "image/*,application/pdf,audio/*,video/mp4,video/webm,text/*,.md,.csv,.json,.xml,.js,.ts,.tsx,.py,.java,.c,.cpp,.cs,.sql,.yml,.yaml";

function mediaTypeFor(file: File): string | null {
  const t = file.type;
  if (t.startsWith("image/") || t === "application/pdf" || t.startsWith("audio/")) return t;
  if (t === "video/mp4" || t === "video/webm") return t;
  if (t.startsWith("text/") || t === "application/json" || TEXT_EXT.test(file.name)) return "text/plain";
  return null;
}

function readAsDataUrl(file: File, mediaType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*/, `data:${mediaType}`));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** Convierte un SVG en PNG de 1024 px (se dibuja con las fuentes del navegador) y lo descarga. */
async function downloadSvgAsPng(src: string, size = 1024) {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  const canvas = document.createElement("canvas");
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
  canvas.width = size;
  canvas.height = Math.round(size * ratio);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "lingua-imagen.png";
  a.click();
}

const textOfMessage = (m: ChatUIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

function FilePart({
  part,
  generated,
  onEdit,
}: {
  part: FileUIPart;
  generated: boolean;
  /** Abre la imagen en el editor. */
  onEdit?: (src: string) => void;
}) {
  // Los archivos grandes no se guardan en el historial.
  if (!part.url) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <FileText className="size-4" /> {part.filename ?? "Archivo"} (no se guardó en el historial)
      </span>
    );
  }
  if (part.mediaType.startsWith("image/")) {
    return (
      <div className="group relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={part.url} alt={part.filename ?? "Imagen"}
          className={`rounded-2xl border border-slate-200 object-cover ${generated ? "max-h-[420px] w-full max-w-md" : "max-h-48 max-w-[240px]"}`} />
        {/* En móvil no hay "hover": los botones se ven siempre. */}
        <div className="absolute right-2 top-2 flex gap-1.5 transition sm:opacity-0 sm:group-hover:opacity-100">
          {onEdit && (
            <button type="button" onClick={() => onEdit(part.url)}
              className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white hover:bg-black/80">
              <Pencil className="size-3.5" /> Editar
            </button>
          )}
          {generated && (
            <a href={part.url} download={`lingua-imagen.${imageExtension(part.mediaType)}`}
              className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white hover:bg-black/80">
              <Download className="size-3.5" /> {part.mediaType.includes("svg") ? "SVG" : "Descargar"}
            </a>
          )}
          {generated && part.mediaType.includes("svg") && (
            <button type="button" onClick={() => downloadSvgAsPng(part.url)}
              className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white hover:bg-black/80">
              <Download className="size-3.5" /> PNG
            </button>
          )}
        </div>
      </div>
    );
  }
  if (part.mediaType.startsWith("audio/")) {
    return (
      <div className="flex max-w-md items-center gap-2">
        <audio controls src={part.url} className="w-full" />
        {generated && (
          <a href={part.url} download="lingua-audio.wav" className="rounded-full p-2 hover:bg-slate-100" aria-label="Descargar audio">
            <Download className="size-4" />
          </a>
        )}
      </div>
    );
  }
  return (
    <span className="inline-flex max-w-[240px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
      <FileText className="size-5 shrink-0 text-rose-500" />
      <span className="truncate">{part.filename ?? "Archivo"}</span>
    </span>
  );
}

/** Tarjeta de progreso de la investigación profunda. */
function ResearchCard({ data }: { data: ResearchProgress }) {
  const steps = [
    { id: "planning", label: "Planificando la investigación" },
    { id: "searching", label: "Buscando fuentes" },
    { id: "writing", label: "Redactando el informe" },
  ] as const;
  const order = ["planning", "searching", "writing", "done"];
  const current = order.indexOf(data.status === "error" ? "writing" : data.status);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <Telescope className="size-4 text-brand-700" /> Investigación profunda
        {data.sources > 0 && <span className="font-normal text-slate-500">· {data.sources} fuentes</span>}
      </p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const done = current > i || data.status === "done";
          const active = current === i && data.status !== "done" && data.status !== "error";
          return (
            <li key={s.id}>
              <span className="flex items-center gap-2">
                {done ? (
                  <Check className="size-4 text-brand-700" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-brand-700" />
                ) : (
                  <span className="size-4 rounded-full border border-slate-300" />
                )}
                <span className={done || active ? "text-slate-800" : "text-slate-400"}>{s.label}</span>
              </span>
              {s.id === "searching" && data.queries.length > 0 && (
                <ul className="ml-6 mt-1 space-y-0.5 text-xs text-slate-500">
                  {data.queries.map((q) => (
                    <li key={q.text} className="flex items-center gap-1.5">
                      {q.done ? <Search className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
                      “{q.text}”{q.done && ` · ${q.found} ${q.found === 1 ? "resultado" : "resultados"}`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {data.status === "error" && <p className="mt-2 text-xs text-rose-600">No se pudo terminar el informe.</p>}
    </div>
  );
}

interface AssistantProps {
  message: ChatUIMessage;
  question: string;
  conversationId: string;
  /** La respuesta ya terminó de escribirse. */
  done: boolean;
  isLast: boolean;
  onEdit: (src: string) => void;
  onRegenerate: () => void;
  onOpenSettings: (section?: string) => void;
  /** Crea tarjetas o un examen con el texto de la respuesta. */
  onStudy: (mode: StudyMode, text: string, question: string) => void;
  read: { playing: string | null; loading: string | null; speak: (id: string, md: string) => void; stop: () => void };
}

/** Las respuestas muy cortas no dan para tarjetas ni examen. */
const MIN_STUDY_CHARS = 200;

function AssistantMessage({ message, question, conversationId, done, isLast, onEdit, onRegenerate, onOpenSettings, onStudy, read }: AssistantProps) {
  const [copied, setCopied] = useState(false);
  const text = textOfMessage(message);
  const meta = message.parts.find((p) => p.type === "data-meta");
  const research = message.parts.find((p) => p.type === "data-research");
  const memories = message.parts.filter((p) => p.type === "data-memory");
  const reasoning = message.parts.filter((p) => p.type === "reasoning");
  const reasoningText = reasoning.map((p) => p.text).join("\n").trim();
  const thinking = reasoning.some((p) => p.state === "streaming") && !text;
  const files = message.parts.filter((p): p is FileUIPart => p.type === "file");
  const sources = message.parts.filter((p) => p.type === "source-url");
  const videos = message.parts.find((p) => p.type === "data-videos");
  const unique = sources.filter((s, i) => sources.findIndex((o) => o.url === s.url) === i);
  const isPlaying = read.playing === message.id;
  const isLoadingVoice = read.loading === message.id;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin permiso de portapapeles */
    }
  }

  const action = "rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";

  return (
    <div className="flex gap-3">
      <Logo className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-4">
        {research && <ResearchCard data={research.data} />}

        {reasoningText && (
          <details open={thinking} className="group rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-slate-600">
              <Brain className={`size-4 ${thinking ? "animate-pulse text-brand-700" : ""}`} />
              {thinking ? "Razonando…" : "Razonamiento"}
              <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 border-slate-200 pl-3 text-[13px] leading-6 text-slate-500">
              {reasoningText}
            </div>
          </details>
        )}

        {files.map((f, i) => <FilePart key={i} part={f} generated onEdit={onEdit} />)}
        {text && <Markdown>{text}</Markdown>}

        {memories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {memories.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenSettings("memory")}
                className="flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700 hover:bg-violet-100"
                title="Gestionar memoria"
              >
                <Brain className="size-3.5" /> Memoria guardada: {m.data.text}
              </button>
            ))}
          </div>
        )}

        {unique.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe className="size-4" /> Fuentes consultadas
            </h3>
            <ul className="flex flex-wrap gap-2">
              {unique.slice(0, 12).map((s, i) => (
                <li key={s.sourceId}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title ?? s.url}
                    className="flex max-w-[260px] items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                    <span className="font-medium text-slate-500">{i + 1}</span>
                    <span className="truncate">{s.title ?? hostname(s.url)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {videos && <VideoGrid videos={videos.data.items} searchUrl={videos.data.searchUrl} />}

        {done && text && (
          <div className="flex flex-wrap items-center gap-0.5">
            <button type="button" onClick={copy} className={action} aria-label="Copiar respuesta" title="Copiar">
              {copied ? <Check className="size-4 text-brand-700" /> : <Copy className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => (isPlaying ? read.stop() : read.speak(message.id, text))}
              className={action}
              aria-label={isPlaying ? "Detener lectura" : "Leer en voz alta"}
              title={isPlaying ? "Detener lectura" : "Leer en voz alta"}
            >
              {isLoadingVoice ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isPlaying ? (
                <VolumeX className="size-4 text-brand-700" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
            {isLast && (
              <button type="button" onClick={onRegenerate} className={action} aria-label="Regenerar respuesta" title="Regenerar">
                <RefreshCw className="size-4" />
              </button>
            )}
            {text.length >= MIN_STUDY_CHARS && (
              <>
                <button
                  type="button"
                  onClick={() => onStudy("cards", text, question)}
                  className={action}
                  aria-label="Crear tarjetas de estudio"
                  title="Crear tarjetas de estudio"
                >
                  <Layers className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onStudy("quiz", text, question)}
                  className={action}
                  aria-label="Hacer un examen"
                  title="Examen sobre esta respuesta"
                >
                  <ClipboardList className="size-4" />
                </button>
              </>
            )}
            {meta && (
              <FeedbackButtons
                messageId={message.id}
                conversationId={conversationId}
                question={question}
                answer={text}
                provider={meta.data.provider}
                model={meta.data.model}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Texto de la pregunta del usuario que precede al mensaje `index`. */
function previousQuestion(messages: ChatUIMessage[], index: number) {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "user") return textOfMessage(messages[i]).trim();
  }
  return "";
}

const TOOL_INFO = {
  deep: { label: "Investigación profunda", Icon: Telescope, placeholder: "¿Qué quieres investigar a fondo?" },
  image: { label: "Crear imagen", Icon: ImageIcon, placeholder: "Describe la imagen que quieres crear" },
  audio: { label: "Crear audio", Icon: AudioLines, placeholder: "Escribe el texto que quieres convertir en voz" },
} as const;

const WAITING: Record<string, string> = {
  image: "Creando la imagen…",
  audio: "Creando el audio…",
  deep: "Preparando la investigación…",
};

/** Selector del asistente personalizado del chat. */
function GemPicker({
  gemId,
  onChange,
  onManage,
}: {
  gemId: string | null;
  onChange: (id: string | null) => void;
  onManage: () => void;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const gem = settings.gems.find((g) => g.id === gemId);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        <span>{gem ? gem.emoji : "🎓"}</span>
        <span className="max-w-[180px] truncate font-medium">{gem ? gem.name : "Tutor de estudio"}</span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-10 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 ${!gem ? "bg-slate-50 font-medium" : ""}`}
            >
              <span>🎓</span> Tutor de estudio <span className="ml-auto text-xs text-slate-400">por defecto</span>
            </button>
            {settings.gems.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { onChange(g.id); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 ${gem?.id === g.id ? "bg-slate-50 font-medium" : ""}`}
              >
                <span>{g.emoji}</span> <span className="truncate">{g.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setOpen(false); onManage(); }}
              className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-slate-100 px-3 py-2 text-left text-sm text-brand-700 hover:bg-slate-100"
            >
              <Plus className="size-4" /> Crear o gestionar asistentes
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatTutor({ profile, history, onOpenSettings, decks, onOpenCards }: Props) {
  const chat = history.active;
  const { settings, addMemory } = useSettings();
  const { messages, sendMessage, status, error, stop, regenerate } = useChat<ChatUIMessage>({
    id: chat.id,
    messages: chat.messages,
    // La IA decidió recordar algo: se guarda en la memoria del usuario. El servidor
    // solo envía estos datos si la memoria estaba activada al enviar el mensaje.
    onData: (part) => {
      if (part.type === "data-memory") addMemory(part.data.text);
    },
  });
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileUIPart[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [reasoningChoice, setReasoningChoice] = useState<boolean | null>(null);
  const reasoning = reasoningChoice ?? settings.reasoningDefault;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<Tool>(null);
  /** Imagen abierta en el editor; `replace` = índice del adjunto que se sustituirá al terminar. */
  const [editing, setEditing] = useState<{ src: string; replace?: number } | null>(null);
  const [camera, setCamera] = useState(false);
  /** Tarjetas o examen que se están creando a partir de una respuesta. */
  const [study, setStudy] = useState<{ mode: StudyMode; text: string; topic: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  const busy = status === "submitted" || status === "streaming";
  const read = useReadAloud(settings.voice);

  // Dictado: lo reconocido se añade al texto del mensaje.
  const dictation = useSpeechRecognition(settings.voice.dictationLang, (t) =>
    setInput((prev) => (prev ? `${prev.trimEnd()} ${t}` : t))
  );

  // Guarda la conversación al terminar cada respuesta (y la lee en voz alta si está activado).
  const prevStatus = useRef(status);
  const historyRef = useRef(history);
  historyRef.current = history;
  useEffect(() => {
    const finished = (prevStatus.current === "streaming" || prevStatus.current === "submitted") && !busy;
    prevStatus.current = status;
    if (!finished || !messages.length) return;
    historyRef.current.saveMessages(historyRef.current.active, messages);
    const last = messages[messages.length - 1];
    if (status === "ready" && settings.voice.autoRead && last.role === "assistant") {
      const text = textOfMessage(last);
      if (text) read.speak(last.id, text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Auto-scroll solo si el usuario ya estaba al final.
  useEffect(() => {
    const el = containerRef.current;
    if (el && wasAtBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // El cuadro de texto crece con el contenido (hasta un máximo).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function handleScroll() {
    const el = containerRef.current;
    if (el) wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  async function addFiles(list: FileList | File[]) {
    setNotice(null);
    const next = [...files];
    let total = next.reduce((s, f) => s + f.url.length * 0.75, 0);
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) { setNotice(`Máximo ${MAX_FILES} archivos por mensaje.`); break; }
      const type = mediaTypeFor(file);
      if (!type) {
        setNotice(`"${file.name}" no es compatible. Usa PDF, imágenes, texto o audio.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES || total + file.size > MAX_TOTAL_BYTES) {
        setNotice(`"${file.name}" es demasiado grande (máximo 10 MB por archivo).`);
        continue;
      }
      try {
        next.push({ type: "file", mediaType: type, filename: file.name, url: await readAsDataUrl(file, type) });
        total += file.size;
      } catch { setNotice(`No se pudo leer "${file.name}".`); }
    }
    setFiles(next);
    if (tool !== "deep") setTool(null);
  }

  /** Adjunta una imagen hecha en la app (foto o imagen editada). */
  function attachImage(dataUrl: string, filename: string, replace?: number) {
    const part: FileUIPart = { type: "file", mediaType: "image/jpeg", filename, url: dataUrl };
    setTool(null);
    if (replace !== undefined) {
      setFiles((f) => f.map((x, i) => (i === replace ? part : x)));
      return;
    }
    if (files.length >= MAX_FILES) {
      setNotice(`Máximo ${MAX_FILES} archivos por mensaje. Quita uno para adjuntar la imagen.`);
      return;
    }
    setFiles((f) => [...f, part]);
    setNotice("Imagen adjuntada. Escribe una pregunta o envíala tal cual.");
    inputRef.current?.focus();
  }

  /** Abre en el editor una imagen elegida desde el equipo. */
  async function openFileInEditor(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice(`"${file.name}" no es una imagen.`);
      return;
    }
    try {
      setEditing({ src: await readAsDataUrl(file, file.type) });
    } catch {
      setNotice(`No se pudo leer "${file.name}".`);
    }
  }

  /** Datos que acompañan a cada mensaje: modo, personalización, memoria y asistente. */
  function requestBody(t: Tool) {
    return {
      mode: "chat",
      provider: profile.provider,
      tool: t === "image" || t === "audio" ? t : undefined,
      research: t === "deep",
      reasoning,
      voice: settings.voice.name,
      conversationId: chat.id,
      ...chatContext(settings, chat.gemId),
    };
  }

  const lastTool = useRef<Tool>(null);

  function send(text: string) {
    const t = text.trim();
    if (busy || (!t && files.length === 0)) return;
    if (dictation.listening) dictation.stop();
    read.stop();
    setPendingTool(tool);
    lastTool.current = tool;
    wasAtBottom.current = true;
    sendMessage(
      { text: t || "Explícame este archivo.", files: files.length ? files : undefined },
      { body: requestBody(tool) }
    );
    setInput("");
    setFiles([]);
    setNotice(null);
    // La investigación profunda es para un mensaje; crear imagen/audio también.
    setTool(null);
  }

  function retry() {
    setPendingTool(lastTool.current);
    regenerate({ body: requestBody(lastTool.current) });
  }

  const toolInfo = tool ? TOOL_INFO[tool] : null;
  const waitingLabel = pendingTool ? WAITING[pendingTool] : reasoning ? "Razonando…" : "Investigando…";
  const hasAssistant = messages.some((m) => m.role === "assistant");
  const gem = settings.gems.find((g) => g.id === chat.gemId);
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant");

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
    >
      {editing && (
        <ImageEditor
          src={editing.src}
          onClose={() => setEditing(null)}
          onUse={(url) => {
            const replace = editing.replace;
            setEditing(null);
            attachImage(url, "imagen-editada.jpg", replace);
          }}
        />
      )}
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(url) => {
            setCamera(false);
            attachImage(url, "foto.jpg");
          }}
        />
      )}
      {study && (
        <StudyModal
          mode={study.mode}
          text={study.text}
          topic={study.topic}
          chatId={chat.id}
          provider={profile.provider}
          decks={decks}
          onClose={() => setStudy(null)}
          onOpenCards={onOpenCards}
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-brand-600 bg-brand-50/90 text-lg font-semibold text-brand-700">
          Suelta los archivos para adjuntarlos
        </div>
      )}

      {/* Barra superior del chat: asistente y exportación */}
      <div className="flex items-center gap-2 px-4 pt-1">
        <GemPicker
          gemId={chat.gemId ?? null}
          onChange={(id) => history.setGem(chat, id)}
          onManage={() => onOpenSettings("gems")}
        />
        {hasAssistant && !busy && (
          <div className="ml-auto">
            <ExportMenu messages={messages} title={chat.title || "Chat de consulta – Lingua Tutor"} />
          </div>
        )}
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 pt-8 text-center">
              {gem ? <span className="text-5xl">{gem.emoji}</span> : <Logo className="size-14" />}
              <h2 className="text-2xl font-semibold">{gem ? gem.name : "¿Qué quieres saber hoy?"}</h2>
              <p className="max-w-md text-sm text-slate-500">
                {gem
                  ? gem.instructions.slice(0, 160) + (gem.instructions.length > 160 ? "…" : "")
                  : "Pregunta sobre cualquier tema, adjunta un archivo o toma una foto. Con + tienes investigación profunda, cámara, imágenes y audio."}
              </p>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50">{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-2">
                {m.parts.some((p) => p.type === "file") && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
                    {m.parts.map((p, j) =>
                      p.type === "file" ? (
                        <FilePart key={j} part={p} generated={false} onEdit={(src) => setEditing({ src })} />
                      ) : null
                    )}
                  </div>
                )}
                <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[#f4f4f4] px-4 py-2.5 text-[15px]">
                  {m.parts.map((p, j) => (p.type === "text" ? <span key={j}>{p.text}</span> : null))}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={m.id}
                message={m}
                conversationId={chat.id}
                done={!(busy && i === messages.length - 1)}
                isLast={i === lastAssistantIndex && !busy}
                question={previousQuestion(messages, i)}
                onEdit={(src) => setEditing({ src })}
                onRegenerate={retry}
                onOpenSettings={onOpenSettings}
                onStudy={(mode, text, topic) => setStudy({ mode, text, topic })}
                read={read}
              />
            )
          )}

          {status === "submitted" && (
            <div className="flex gap-3">
              <Logo className="size-7 shrink-0 animate-pulse" />
              <span className="mt-1 text-sm text-slate-400">{waitingLabel}</span>
            </div>
          )}
          {error && !busy && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>No se pudo obtener respuesta: {error.message}</span>
              <button type="button" onClick={retry} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium hover:bg-rose-100">
                <RefreshCw className="size-3.5" /> Reintentar
              </button>
            </div>
          )}
          {read.notice && <p className="text-center text-xs text-amber-700">{read.notice}</p>}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="px-4 pb-4">
        <div className="mx-auto max-w-3xl">
          {notice && <p className="mb-2 px-2 text-sm text-amber-700">{notice}</p>}
          {dictation.error && <p className="mb-2 px-2 text-sm text-rose-600">{dictation.error}</p>}
          <div className="rounded-[28px] bg-[#f4f4f4] p-2">
            {(files.length > 0 || toolInfo) && (
              <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1">
                {files.map((f, i) => (
                  <span key={i} className="relative">
                    {f.mediaType.startsWith("image/") ? (
                      <button type="button" onClick={() => setEditing({ src: f.url, replace: i })}
                        className="group/thumb relative block" title="Editar imagen" aria-label={`Editar ${f.filename ?? "imagen"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.filename ?? ""} className="size-14 rounded-xl object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-white opacity-0 transition group-hover/thumb:opacity-100">
                          <Pencil className="size-4" />
                        </span>
                      </button>
                    ) : (
                      <span className="flex h-14 max-w-[200px] items-center gap-2 rounded-xl bg-white px-3 text-sm">
                        <FileText className="size-5 shrink-0 text-rose-500" />
                        <span className="truncate">{f.filename}</span>
                      </span>
                    )}
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-black p-0.5 text-white" aria-label={`Quitar ${f.filename}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {toolInfo && (
                  <span className="flex items-center gap-1.5 self-center rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
                    <toolInfo.Icon className="size-4" /> {toolInfo.label}
                    <button type="button" onClick={() => setTool(null)} aria-label="Quitar herramienta"><X className="size-3.5" /></button>
                  </span>
                )}
              </div>
            )}

            {dictation.listening && (
              <p className="px-3 pb-1 text-sm text-rose-600">🎙️ {dictation.interim || "Escuchando…"}</p>
            )}

            <div className="flex items-end gap-1.5">
              <div className="relative">
                <button type="button" onClick={() => setMenuOpen((v) => !v)}
                  className="flex size-9 items-center justify-center rounded-full hover:bg-slate-200" aria-label="Adjuntar o crear">
                  <Plus className="size-5" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div className="absolute bottom-11 left-0 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      {[
                        { label: "Adjuntar archivos o fotos", Icon: Paperclip, run: () => fileRef.current?.click() },
                        { label: "Tomar foto", Icon: Camera, run: () => setCamera(true) },
                        { label: "Editar una imagen", Icon: Pencil, run: () => editFileRef.current?.click() },
                      ].map(({ label, Icon, run }) => (
                        <button key={label} type="button" onClick={() => { setMenuOpen(false); run(); }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-100">
                          <Icon className="size-4" /> {label}
                        </button>
                      ))}
                      <div className="my-1 border-t border-slate-100" />
                      {(Object.keys(TOOL_INFO) as (keyof typeof TOOL_INFO)[]).map((k) => {
                        const { label, Icon } = TOOL_INFO[k];
                        return (
                          <button key={k} type="button"
                            onClick={() => { setMenuOpen(false); setTool(k); if (k !== "deep") setFiles([]); inputRef.current?.focus(); }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-100">
                            <Icon className="size-4" /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden
                  onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
                <input ref={editFileRef} type="file" accept="image/*" hidden
                  onChange={(e) => { openFileInEditor(e.target.files?.[0]); e.target.value = ""; }} />
              </div>

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envía; Mayús+Enter hace un salto de línea.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                onPaste={(e) => {
                  const pasted = Array.from(e.clipboardData.files);
                  if (pasted.length) { e.preventDefault(); addFiles(pasted); }
                }}
                placeholder={toolInfo?.placeholder ?? (files.length ? "Pregunta sobre el archivo (opcional)" : "Pregunta lo que quieras")}
                className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 outline-none placeholder:text-slate-500"
              />

              <button
                type="button"
                onClick={() => setReasoningChoice(!reasoning)}
                className={`flex h-9 items-center gap-1 rounded-full px-2.5 text-sm ${reasoning ? "bg-brand-100 font-medium text-brand-700" : "text-slate-500 hover:bg-slate-200"}`}
                aria-pressed={reasoning}
                title="Razona paso a paso antes de responder (más lento, mejor para matemáticas y problemas)"
              >
                <Lightbulb className="size-4" />
                <span className="hidden sm:inline">Razonar</span>
              </button>

              {dictation.supported && (
                <button
                  type="button"
                  onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                  className={`flex size-9 items-center justify-center rounded-full ${dictation.listening ? "animate-pulse bg-rose-100 text-rose-600" : "text-slate-500 hover:bg-slate-200"}`}
                  aria-label={dictation.listening ? "Detener dictado" : "Dictar por voz"}
                  title={dictation.listening ? "Detener dictado" : "Dictar por voz"}
                >
                  {dictation.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
              )}

              {busy ? (
                <button type="button" onClick={() => stop()}
                  className="flex size-9 items-center justify-center rounded-full bg-black text-white" aria-label="Detener respuesta" title="Detener">
                  <Square className="size-3.5" fill="currentColor" />
                </button>
              ) : (
                <button type="submit"
                  disabled={!input.trim() && (files.length === 0 || tool === "image" || tool === "audio")}
                  className="flex size-9 items-center justify-center rounded-full bg-black text-white disabled:bg-slate-300" aria-label="Enviar">
                  <ArrowUp className="size-5" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            La IA puede equivocarse. Comprueba la información importante.
          </p>
        </div>
      </form>
    </div>
  );
}
