"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Music,
  Play,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
import StatsBar from "@/components/language/StatsBar";
import { speechCode, type Profile } from "@/lib/languages";
import { cacheGet, cacheSet, type ProgressApi } from "@/lib/progress";
import { compareSpeech } from "@/lib/similarity";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/useSpeech";
import type { VideoDTO } from "@/lib/types";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Verse {
  label: string; // "Estrofa 1", "Estribillo"…
  original: string;
  translation: string;
  tip: string;
  blanks: string[];
}

interface VocabWord {
  word: string;
  translation: string;
  example: string;
  exampleTranslation: string;
  emoji: string;
}

interface SongData {
  title: string;
  summary: string;
  verses: Verse[];
  vocabulary: VocabWord[];
  videos: VideoDTO[];
  searchUrl: string;
  karaokeLine: string;
}

// ─── Sugerencias ────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { title: "Bohemian Rhapsody", artist: "Queen" },
  { title: "Let It Be", artist: "The Beatles" },
  { title: "Shape of You", artist: "Ed Sheeran" },
  { title: "La vie en rose", artist: "Édith Piaf" },
  { title: "Bella ciao", artist: "" },
  { title: "Despacito", artist: "Luis Fonsi" },
];

const SPEAK_PASS = 65;

// ─── Helpers ────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s']/g, "")
    .trim();
}

function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Índices de tokens-palabra que se ocultan en el ejercicio de huecos. */
function blankIndexes(text: string, blanks: string[]): number[] {
  const tokens = tokenizeWords(text);
  const used = new Set<number>();
  for (const b of blanks) {
    const target = norm(b);
    if (!target) continue;
    const idx = tokens.findIndex((t, i) => !used.has(i) && norm(t) === target);
    if (idx >= 0) used.add(idx);
  }
  return [...used].sort((a, b) => a - b);
}

function blankOk(typed: string, expected: string) {
  const a = norm(typed);
  const b = norm(expected);
  if (!a) return false;
  if (a === b) return true;
  if (b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// ─── Panel de vocabulario (glosario) ────────────────────────────────────────

interface GlossaryProps {
  words: VocabWord[];
  saved: Set<string>;
  lang: string;
  onSave: (word: VocabWord) => void;
  onClose: () => void;
}

function Glossary({ words, saved, lang, onSave, onClose }: GlossaryProps) {
  const { speak } = useSpeechSynthesis(lang);
  const [selected, setSelected] = useState<VocabWord | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold">
            <BookOpen className="size-5 text-brand-600" /> Glosario de la canción
          </h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        {/* Detalle de la palabra seleccionada */}
        {selected ? (
          <div className="space-y-4 p-5">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              <ChevronLeft className="size-4" /> Volver
            </button>
            <div className="rounded-2xl bg-slate-50 p-5 text-center">
              <span className="text-5xl">{selected.emoji}</span>
              <p className="mt-2 text-2xl font-bold">{selected.word}</p>
              <p className="mt-1 text-slate-500">{selected.translation}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-500">Ejemplo</p>
              <p className="mt-1 font-medium italic">"{selected.example}"</p>
              <p className="mt-0.5 text-sm text-slate-500">{selected.exampleTranslation}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => speak(selected.word)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2.5 font-semibold hover:bg-slate-50"
              >
                <Volume2 className="size-4" /> Pronunciar
              </button>
              <button
                onClick={() => speak(selected.word, 0.6)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2.5 font-semibold hover:bg-slate-50"
              >
                🐢 Lento
              </button>
              <button
                onClick={() => onSave(selected)}
                disabled={saved.has(selected.word)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 font-semibold ${
                  saved.has(selected.word)
                    ? "bg-brand-50 text-brand-600"
                    : "bg-brand-600 text-white shadow-[0_3px_0_#0d8b6c]"
                }`}
              >
                {saved.has(selected.word) ? <Check className="size-4" /> : null}
                {saved.has(selected.word) ? "Guardada" : "Guardar"}
              </button>
            </div>
            <button
              onClick={() => speak(selected.example)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Volume2 className="size-4" /> Escuchar el ejemplo
            </button>
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {words.map((w) => (
              <li key={w.word}>
                <button
                  onClick={() => setSelected(w)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="text-2xl">{w.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{w.word}</span>
                    <span className="block truncate text-sm text-slate-500">{w.translation}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {saved.has(w.word) && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                        ✔ guardada
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(w.word);
                      }}
                      className="rounded-full p-1.5 hover:bg-slate-100"
                      title={`Pronunciar "${w.word}"`}
                    >
                      <Volume2 className="size-4 text-slate-500" />
                    </button>
                    <ChevronRight className="size-4 text-slate-300" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente: práctica de un verso ───────────────────────────────────

interface VersePracticeProps {
  verse: Verse;
  lang: string;
  idx: number;
  total: number;
  scores: boolean[];
  onResult: (correct: boolean) => void;
  onPrev: () => void;
}

type PracticeMode = "fill" | "speak";

function VersePractice({ verse, lang, idx, total, scores, onResult, onPrev }: VersePracticeProps) {
  const mode: PracticeMode = idx % 2 === 0 ? "fill" : "speak";
  const { speak } = useSpeechSynthesis(lang);

  const [inputs, setInputs] = useState<string[]>([]);
  const [heard, setHeard] = useState("");
  const [checked, setChecked] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const rec = useSpeechRecognition(lang, (t) => setHeard(t));

  const tokens = tokenizeWords(verse.original);
  const gaps = blankIndexes(verse.original, verse.blanks);

  const canCheck =
    !checked &&
    (mode === "fill" ? gaps.every((_, k) => (inputs[k] ?? "").trim()) : !!heard);

  function check() {
    if (rec.listening) rec.stop();
    setChecked(true);
  }

  const fillOk = checked && mode === "fill" && gaps.every((ti, k) => blankOk(inputs[k] ?? "", tokens[ti]));
  const speakResult = checked && mode === "speak" && heard ? compareSpeech(verse.original, heard) : null;
  const speakOk = !!speakResult && speakResult.score >= SPEAK_PASS;
  const correct = mode === "fill" ? fillOk : speakOk;

  // Reconstruye el verso mostrando huecos o palabras coloreadas
  function renderVerse() {
    // Para el modo speak después de comprobar, mostrar coloración palabra a palabra
    if (mode === "speak" && speakResult) {
      return (
        <p className="text-xl font-semibold leading-relaxed">
          {speakResult.words.map((w, i) => (
            <span key={i} className={w.ok ? "text-green-700" : "text-rose-500 underline"}>
              {w.word}{" "}
            </span>
          ))}
        </p>
      );
    }

    // Para el modo speak antes de comprobar (o tras saltar): mostrar texto completo
    if (mode === "speak") {
      return <p className="text-xl font-semibold leading-relaxed">{verse.original}</p>;
    }

    // Modo fill: huecos interactivos o corregidos
    return (
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2 text-lg leading-relaxed">
        {tokens.map((t, ti) => {
          const k = gaps.indexOf(ti);
          if (k < 0) return <span key={ti}>{t}</span>;
          const good = checked && blankOk(inputs[k] ?? "", t);
          if (checked) {
            return (
              <span
                key={ti}
                className={`rounded px-1 font-semibold ${
                  good ? "bg-green-100 text-green-800" : "bg-rose-100 text-rose-700"
                }`}
              >
                {good ? t : `${inputs[k] || "—"} → ${t}`}
              </span>
            );
          }
          return (
            <input
              key={ti}
              value={inputs[k] ?? ""}
              onChange={(e) =>
                setInputs((prev) => {
                  const next = [...prev];
                  next[k] = e.target.value;
                  return next;
                })
              }
              onKeyDown={(e) => e.key === "Enter" && canCheck && check()}
              autoFocus={k === 0}
              style={{ width: `${Math.max(3, norm(t).length + 2)}ch` }}
              className="border-b-2 border-slate-400 bg-transparent px-0.5 text-center font-semibold outline-none focus:border-brand-600"
              aria-label={`Hueco ${k + 1}`}
            />
          );
        })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de progreso por estrofa */}
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < scores.length
                ? scores[i] ? "bg-green-500" : "bg-rose-400"
                : i === idx ? "bg-brand-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      {/* Etiqueta de estrofa y modo */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-brand-600">{verse.label}</span>
          <span className="ml-2 text-xs text-slate-500">
            {mode === "fill" ? "🎵 Completa los huecos" : "🎤 Repite el verso"}
          </span>
        </div>
        <button
          onClick={() => setShowTip((v) => !v)}
          className={`rounded-full p-1.5 ${showTip ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:text-amber-500"}`}
          title="Ver consejo"
        >
          <Lightbulb className="size-4" />
        </button>
      </div>

      {showTip && (
        <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          💡 {verse.tip}
        </div>
      )}

      {/* Verso */}
      <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
        {renderVerse()}
        <p className="text-sm text-slate-500 italic">{verse.translation}</p>
      </div>

      {/* Controles de audio */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => speak(verse.original)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          <Volume2 className="size-4" /> Escuchar
        </button>
        <button
          onClick={() => speak(verse.original, 0.65)}
          className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          🐢 Lento
        </button>

        {mode === "speak" && !checked && (
          <button
            onClick={() => { if (rec.listening) rec.stop(); else rec.start(); }}
            disabled={!rec.supported}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50 ${
              rec.listening ? "animate-pulse bg-rose-500" : "bg-brand-600 shadow-[0_3px_0_#0d8b6c]"
            }`}
          >
            {rec.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {rec.listening ? "Detener" : heard ? "Otra vez" : "Cantar"}
          </button>
        )}
        {rec.listening && (
          <span className="text-sm italic text-rose-500">{rec.interim || "Escuchando…"}</span>
        )}
        {!rec.supported && mode === "speak" && (
          <span className="text-xs text-amber-700">Voz no disponible. Usa Chrome o Edge.</span>
        )}
      </div>

      {/* Resultado */}
      {checked && (
        <div className={`rounded-xl px-4 py-3 text-sm ${correct ? "bg-green-50 text-green-800" : "bg-rose-50 text-rose-700"}`}>
          <span className="font-bold">
            {correct
              ? "¡Correcto! 🎶 "
              : mode === "speak"
              ? `Casi (${speakResult?.score ?? 0}/100). `
              : "No exactamente. "}
          </span>
          <span className="text-slate-600">{verse.tip}</span>
        </div>
      )}

      {/* Navegación */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onPrev}
          disabled={idx === 0}
          className="flex items-center gap-1 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-30 hover:bg-slate-50"
        >
          <ChevronLeft className="size-4" /> Anterior
        </button>

        <div className="flex items-center gap-2">
          {mode === "speak" && !checked && (
            <button
              onClick={() => { setChecked(true); }}
              className="text-sm font-semibold text-slate-400 hover:text-slate-600"
            >
              Saltar
            </button>
          )}
          {checked ? (
            <button
              onClick={() => onResult(!!correct)}
              className="flex items-center gap-1.5 rounded-2xl bg-brand-600 px-6 py-2.5 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
            >
              {idx + 1 >= total ? "Ver resultados" : "Siguiente"}
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={check}
              disabled={!canCheck}
              className="rounded-2xl bg-rose-500 px-6 py-2.5 font-bold text-white hover:bg-rose-600 disabled:opacity-40"
            >
              Comprobar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Selector de vídeo integrado ─────────────────────────────────────────────

interface VideoPickerProps {
  videos: VideoDTO[];
  searchUrl: string;
  selected: VideoDTO | null;
  onSelect: (v: VideoDTO) => void;
}

function VideoPicker({ videos, searchUrl, selected, onSelect }: VideoPickerProps) {
  if (videos.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Escucha la canción</h3>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
        >
          Más en YouTube <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Vídeo activo */}
      {selected && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${selected.id}?autoplay=1&rel=0`}
            title={selected.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
          <div className="bg-white px-3 py-2 text-sm">
            <p className="font-medium line-clamp-1">{selected.title}</p>
            <p className="text-xs text-slate-500">{selected.channel}</p>
          </div>
        </div>
      )}

      {/* Miniaturas para elegir */}
      <div className={`grid gap-2 ${selected ? "grid-cols-4" : "grid-cols-2"}`}>
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className={`group overflow-hidden rounded-xl border text-left transition ${
              selected?.id === v.id
                ? "border-brand-500 ring-2 ring-brand-400"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                {selected?.id !== v.id && (
                  <span className="flex size-8 items-center justify-center rounded-full bg-black/70 text-white">
                    <Play className="ml-0.5 size-3.5" fill="currentColor" />
                  </span>
                )}
              </span>
              {v.duration && (
                <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-semibold text-white">
                  {Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, "0")}
                </span>
              )}
            </div>
            {!selected && (
              <div className="p-1.5 text-xs">
                <p className="line-clamp-1 font-medium">{v.title}</p>
                <p className="text-slate-400 truncate">{v.channel}</p>
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function SongStudy({ profile, api }: { profile: Profile; api: ProgressApi }) {
  const lang = speechCode(profile.language);

  // Búsqueda
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [data, setData] = useState<SongData | null>(null);
  const [mediaKey, setMediaKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vídeo seleccionado
  const [activeVideo, setActiveVideo] = useState<VideoDTO | null>(null);

  // Sesión de práctica
  const [verseIdx, setVerseIdx] = useState(0);
  const [scores, setScores] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);

  // Glosario
  const [showGlossary, setShowGlossary] = useState(false);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  const { speak } = useSpeechSynthesis(lang);

  const stat = mediaKey ? api.lang.media[mediaKey] : undefined;

  const recent = Object.entries(api.lang.media)
    .filter(([k]) => k.startsWith(`song:${profile.language}:`))
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, 5);

  function resetSession() {
    setVerseIdx(0);
    setScores([]);
    setFinished(false);
  }

  async function load(t: string, a: string) {
    const name = t.trim();
    if (!name || loading) return;
    setTitle(name);
    setArtist(a.trim());
    const key = `song:${profile.language}:${profile.level}:${name.toLowerCase()}:${a.trim().toLowerCase()}`;
    const cacheKey = `lingua-song:${key}`;
    resetSession();
    setActiveVideo(null);
    setSavedWords(new Set());
    const cached = cacheGet<SongData>(cacheKey);
    if (cached?.verses?.length) {
      setData(cached);
      setMediaKey(key);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "song",
          title: name,
          artist: a.trim(),
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
      setError(e instanceof Error ? e.message : "No se pudo preparar la canción");
    } finally {
      setLoading(false);
    }
  }

  function handleVerseResult(correct: boolean) {
    if (!data) return;
    const nextScores = [...scores, correct];
    setScores(nextScores);
    if (correct) api.addXp(3);
    if (verseIdx + 1 >= data.verses.length) {
      const pct = Math.round((nextScores.filter(Boolean).length / data.verses.length) * 100);
      api.recordMedia(mediaKey, data.title, pct);
      api.addXp(10);
      setFinished(true);
    } else {
      setVerseIdx((i) => i + 1);
    }
  }

  function saveWord(word: VocabWord) {
    api.addWords([word]);
    setSavedWords((prev) => new Set([...prev, word.word]));
  }

  function saveAll() {
    if (!data) return;
    api.addWords(data.vocabulary);
    setSavedWords(new Set(data.vocabulary.map((w) => w.word)));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto px-4 pb-10">
      <div className="mx-auto max-w-2xl space-y-5 py-4">
        <StatsBar api={api} />

        {/* Buscador */}
        <form
          onSubmit={(e) => { e.preventDefault(); load(title, artist); }}
          className="flex flex-wrap gap-2 rounded-[28px] bg-[#f4f4f4] p-2"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Canción (ej. Bohemian Rhapsody)"
            className="min-w-[180px] flex-1 bg-transparent px-3 text-[15px] outline-none"
          />
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artista (opcional)"
            className="w-40 rounded-full bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
            Estudiar
          </button>
        </form>

        {/* Sugerencias e historial */}
        {!data && !loading && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => load(s.title, s.artist)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                >
                  🎵 {s.title}{s.artist ? ` — ${s.artist}` : ""}
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Canciones recientes</h3>
                <ul className="space-y-1.5">
                  {recent.map(([key, m]) => {
                    const parts = key.split(":");
                    const t = parts[3] ?? m.title;
                    const a = parts[4] ?? "";
                    return (
                      <li key={key}>
                        <button
                          onClick={() => load(t, a)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium">🎵 {m.title}</span>
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

        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Preparando la canción…
          </p>
        )}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

        {/* ── Contenido principal ── */}
        {data && !loading && (
          <div className="space-y-6">

            {/* Cabecera con título y botón de glosario */}
            <section className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">🎵 {data.title}</h2>
                <p className="mt-1 text-[15px] text-slate-600">{data.summary}</p>
                {stat && (
                  <p className="mt-1 text-xs text-slate-500">
                    Practicada {stat.reps} {stat.reps === 1 ? "vez" : "veces"} · mejor {stat.best}/100
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowGlossary(true)}
                className="shrink-0 flex items-center gap-1.5 rounded-2xl border-2 border-brand-200 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100"
              >
                <BookOpen className="size-4" />
                Glosario
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">
                  {data.vocabulary.length}
                </span>
              </button>
            </section>

            {/* Selector de vídeo */}
            <VideoPicker
              videos={data.videos}
              searchUrl={data.searchUrl}
              selected={activeVideo}
              onSelect={setActiveVideo}
            />

            {/* Práctica estrofa a estrofa */}
            <section className="rounded-3xl border-2 border-slate-100 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Practica la letra</h3>
                <span className="text-sm text-slate-500">
                  {data.verses[verseIdx]?.label ?? ""}
                </span>
              </div>

              {finished ? (
                <div className="space-y-5 py-4 text-center">
                  <div className="text-5xl">🏆</div>
                  <p className="text-xl font-bold">¡Canción completada!</p>
                  <p className="text-slate-500">
                    {scores.filter(Boolean).length} de {data.verses.length} versos correctos ·{" "}
                    <b>+{scores.filter(Boolean).length * 3 + 10} XP</b>
                  </p>

                  {/* Estribillo para recordar */}
                  {data.karaokeLine && (
                    <div className="rounded-2xl bg-brand-50 px-5 py-4 text-left">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
                        🎤 Estribillo para recordar
                      </p>
                      <p className="text-lg font-semibold italic text-brand-900">
                        "{data.karaokeLine}"
                      </p>
                      <button
                        onClick={() => speak(data.karaokeLine)}
                        className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700"
                      >
                        <Volume2 className="size-3" /> Escuchar
                      </button>
                    </div>
                  )}

                  {/* Guardar todo el vocabulario */}
                  <button
                    onClick={saveAll}
                    disabled={savedWords.size === data.vocabulary.length}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-200 bg-brand-50 py-3 font-bold text-brand-700 disabled:opacity-60"
                  >
                    <BookOpen className="size-4" />
                    {savedWords.size === data.vocabulary.length
                      ? "✔ Todo el vocabulario guardado"
                      : "Guardar todo el vocabulario"}
                  </button>

                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={resetSession}
                      className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-2.5 font-bold"
                    >
                      <RotateCcw className="size-4" /> Repetir
                    </button>
                    <button
                      onClick={() => { setData(null); setTitle(""); setArtist(""); }}
                      className="rounded-2xl bg-brand-600 px-5 py-2.5 font-bold text-white shadow-[0_4px_0_#0d8b6c]"
                    >
                      Otra canción
                    </button>
                  </div>
                </div>
              ) : (
                <VersePractice
                  key={verseIdx}
                  verse={data.verses[verseIdx]}
                  lang={lang}
                  idx={verseIdx}
                  total={data.verses.length}
                  scores={scores}
                  onResult={handleVerseResult}
                  onPrev={() => verseIdx > 0 && setVerseIdx((i) => i - 1)}
                />
              )}
            </section>

            <button
              onClick={() => { setData(null); setTitle(""); setArtist(""); }}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Buscar otra canción
            </button>
          </div>
        )}
      </div>

      {/* Glosario (modal) */}
      {showGlossary && data && (
        <Glossary
          words={data.vocabulary}
          saved={savedWords}
          lang={lang}
          onSave={saveWord}
          onClose={() => setShowGlossary(false)}
        />
      )}
    </div>
  );
}
