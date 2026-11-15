"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import Markdown from "@/components/Markdown";
import VideoGrid from "@/components/VideoGrid";
import type { Profile } from "@/lib/languages";
import type { VideoDTO } from "@/lib/types";

interface Research {
  overview: string;
  keyPoints: string[];
  examples: { title: string; detail: string }[];
  nextSteps: string[];
  videos: VideoDTO[];
  searchUrl: string;
  provider: string;
}

const SUGGESTIONS = [
  "El ciclo del agua",
  "La Segunda Guerra Mundial",
  "Qué es la inteligencia artificial",
  "Ecuaciones de segundo grado",
];

export default function ResearchPanel({ profile }: { profile: Profile }) {
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<Research | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function research(t: string) {
    const q = t.trim();
    if (!q || loading) return;
    setTopic(q);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: q, provider: profile.provider }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al investigar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 py-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          research(topic);
        }}
        className="flex items-center gap-2 rounded-[28px] bg-[#f4f4f4] py-2 pl-5 pr-2"
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="¿Qué tema o pregunta quieres investigar?"
          className="min-h-9 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white disabled:bg-slate-300"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Investigar
        </button>
      </form>

      {!data && !loading && (
        <div className="flex flex-wrap gap-2 text-sm">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => research(s)}
              className="rounded-full border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Investigando y buscando videos…</p>}

      {data && !loading && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-1 text-lg font-semibold">Respuesta</h3>
            <Markdown>{data.overview}</Markdown>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Ideas clave</h3>
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
              {data.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Ejemplos</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.examples.map((e) => (
                <li key={e.title} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <span className="font-medium">{e.title}</span>
                  <span className="mt-1 block text-slate-600">{e.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          {data.videos.length > 0 ? (
            <VideoGrid videos={data.videos} searchUrl={data.searchUrl} />
          ) : (
            <p className="text-sm text-slate-500">
              No se pudieron cargar videos.{" "}
              <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                Buscar en YouTube
              </a>
            </p>
          )}

          {data.nextSteps.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Para estudiar más</h3>
              <ul className="list-disc space-y-1 pl-5 text-[15px]">
                {data.nextSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-slate-400">Generado con {data.provider}</p>
        </div>
      )}
    </div>
  );
}
