"use client";

import { useEffect, useRef, useState } from "react";

/** Parte de la API de iframes de YouTube que se usa. */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_PLAYING = 1;

let apiPromise: Promise<YTNamespace> | null = null;

/** Carga una sola vez el script oficial de la API de iframes. */
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("No se pudo cargar el reproductor de YouTube"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ERRORS: Record<number, string> = {
  2: "El vídeo no es válido.",
  5: "El navegador no puede reproducir este vídeo.",
  100: "El vídeo ya no existe o es privado.",
  101: "El autor no permite verlo fuera de YouTube. Prueba con otro clip.",
  150: "El autor no permite verlo fuera de YouTube. Prueba con otro clip.",
};

/** Reproductor de YouTube controlable (pausar, saltar, velocidad) en el elemento `ref`. */
export function useYouTubePlayer(videoId: string) {
  const ref = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    loadApi()
      .then((YT) => {
        if (cancelled || !ref.current) return;
        // La API sustituye el elemento por el iframe: se usa un hijo para no romper React.
        const mount = document.createElement("div");
        ref.current.replaceChildren(mount);
        player.current = new YT.Player(mount, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, cc_load_policy: 0 },
          events: {
            onReady: () => !cancelled && setReady(true),
            onStateChange: (e) => !cancelled && setPlaying(e.data === YT_PLAYING),
            onError: (e) => !cancelled && setError(ERRORS[e.data] ?? "No se pudo reproducir el vídeo."),
          },
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  return { ref, player, ready, playing, error };
}
