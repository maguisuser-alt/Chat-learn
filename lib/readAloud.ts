"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/settings";

/** Convierte Markdown en texto para leer en voz alta. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (bloque de código) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, "")
    .replace(/[*_~>|#]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trozos de ~200 caracteres cortados por frases (Chrome corta las lecturas largas). */
function chunks(text: string, size = 200): string[] {
  const sentences = text.match(/[^.!?¿¡]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > size && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Lee mensajes en voz alta. Con el motor "natural" usa la voz de Gemini y, si
 * falla (p. ej. sin cuota), cae a la voz del navegador.
 */
export function useReadAloud(voice: Settings["voice"]) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setLoading(null);
  }, []);

  const speakBrowser = useCallback(
    (id: string, text: string, run: number) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) {
        setNotice("Tu navegador no puede leer en voz alta.");
        return;
      }
      const lang = voice.dictationLang || "es-ES";
      const v =
        synth.getVoices().find((x) => x.lang === lang) ??
        synth.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
      const parts = chunks(text);
      parts.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = lang;
        if (v) u.voice = v;
        if (i === parts.length - 1) u.onend = () => runRef.current === run && setPlaying(null);
        u.onerror = () => runRef.current === run && setPlaying(null);
        synth.speak(u);
      });
      setPlaying(id);
    },
    [voice.dictationLang]
  );

  const speak = useCallback(
    async (id: string, markdown: string) => {
      stop();
      setNotice(null);
      const run = runRef.current;
      const text = stripMarkdown(markdown);
      if (!text) return;

      if (voice.engine !== "natural") {
        speakBrowser(id, text, run);
        return;
      }
      const clipped = text.slice(0, 2000);
      const cacheKey = `${voice.name}:${clipped}`;
      try {
        setLoading(id);
        let url = cache.current.get(cacheKey);
        if (!url) {
          const r = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clipped, voice: voice.name }),
          });
          const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
          if (!r.ok || !j.url) throw new Error(j.error ?? "Voz natural no disponible");
          url = j.url;
          cache.current.set(cacheKey, url);
        }
        if (runRef.current !== run) return; // se pidió parar mientras cargaba
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => runRef.current === run && setPlaying(null);
        await audio.play();
        setPlaying(id);
        if (text.length > 2000) setNotice("La voz natural lee los primeros 2000 caracteres.");
      } catch {
        if (runRef.current !== run) return;
        setNotice("La voz natural no está disponible ahora; uso la voz del navegador.");
        speakBrowser(id, text, run);
      } finally {
        if (runRef.current === run) setLoading(null);
      }
    },
    [voice.engine, voice.name, speakBrowser, stop]
  );

  useEffect(() => stop, [stop]);

  return { speak, stop, playing, loading, notice, clearNotice: () => setNotice(null) };
}
