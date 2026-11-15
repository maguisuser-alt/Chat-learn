"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_MS = 15_000;

/** Graba el micrófono con MediaRecorder (funciona también en Firefox y Safari). */
export function useRecorder() {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const done = useRef<((b: Blob | null) => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const release = useCallback(() => {
    clearTimeout(timer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
      release();
    };
  }, [release]);

  /** Empieza a grabar. Devuelve una promesa con la grabación cuando se pare (o null si falla). */
  const start = useCallback(async (): Promise<Promise<Blob | null> | null> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      const result = new Promise<Blob | null>((resolve) => (done.current = resolve));
      rec.onstop = () => {
        release();
        setRecording(false);
        const blob = chunks.current.length ? new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }) : null;
        done.current?.(blob);
        done.current = null;
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      // Límite de duración: las frases de práctica son cortas.
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
      return result;
    } catch (e) {
      release();
      setRecording(false);
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Permite el acceso al micrófono en el navegador."
          : name === "NotFoundError"
            ? "No se encontró micrófono."
            : "No se pudo grabar el audio."
      );
      return null;
    }
  }, [release]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  return { supported, recording, error, start, stop };
}
