"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { LEVELS } from "@/lib/schemas";
import type { GuideSummaryDTO } from "@/lib/types";

interface Props {
  userId: string;
  onUploaded: (guide: GuideSummaryDTO) => void;
  initialLevel?: string;
  initialLanguage?: string;
}

export default function GuideUploader({
  userId,
  onUploaded,
  initialLevel = "A1",
  initialLanguage = "Inglés",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [level, setLevel] = useState(initialLevel);
  const [language, setLanguage] = useState(initialLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("userId", userId);
      body.append("level", level);
      body.append("targetLanguage", language);
      const res = await fetch("/api/guides/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir");
      onUploaded(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">1. Sube tu guía</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-slate-500">Idioma</span>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="text-slate-500">Nivel</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {loading ? "Analizando guía…" : "Seleccionar PDF"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
