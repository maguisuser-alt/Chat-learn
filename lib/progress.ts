"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Word } from "@/lib/lessons";
import { mergeProgress } from "@/lib/progressMerge";
import { schedule, type SrsState } from "@/lib/srs";

/** Días de historial de XP que se conservan. */
const DAILY_KEEP = 120;

export interface WordStat extends Word, Partial<SrsState> {
  seen: number;
  correct: number;
  wrong: number;
  lastSeen: number;
}

export interface PlacementRecord {
  level: string;
  correct: number;
  total: number;
  date: number;
}

export interface MediaStat {
  title: string;
  reps: number;
  best: number;
  lastPlayed: number;
}

export interface LangProgress {
  xp: number;
  /** Lección -> estrellas (1-3). */
  completed: Record<string, number>;
  words: Record<string, WordStat>;
  media: Record<string, MediaStat>;
  games: { pairsBest?: number; rushBest?: number };
  /** XP ganada por día (AAAA-MM-DD), para las estadísticas. */
  daily?: Record<string, number>;
  /** Aciertos por tipo de ejercicio. */
  exercises?: Record<string, { ok: number; total: number }>;
  /** Último test de nivel. */
  placement?: PlacementRecord;
}

export interface Progress {
  streak: number;
  lastDay: string;
  todayXp: number;
  langs: Record<string, LangProgress>;
}

export const DAILY_GOAL = 50;
const KEY = "lingua-progress";

const emptyLang = (): LangProgress => ({ xp: 0, completed: {}, words: {}, media: {}, games: {} });
const EMPTY: Progress = { streak: 0, lastDay: "", todayXp: 0, langs: {} };

/** Fecha local AAAA-MM-DD (no UTC: la racha debe cambiar a medianoche de la persona). */
export function day(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaily(daily: Record<string, number> | undefined, today: string, amount: number) {
  const next = { ...(daily ?? {}), [today]: (daily?.[today] ?? 0) + amount };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - DAILY_KEEP))) delete next[k];
  return next;
}

/** La racha se rompe si el último día con XP no fue hoy ni ayer. */
function normalizeDay(p: Progress): Progress {
  // Antes las fechas se guardaban en UTC: una fecha "futura" es en realidad hoy.
  if (p.lastDay >= day()) return p;
  return { ...p, todayXp: 0, streak: p.lastDay === day(-1) ? p.streak : 0 };
}

/** Progreso de idiomas guardado en el navegador (localStorage). */
export type SyncStatus = "off" | "syncing" | "ok" | "error";

/**
 * Progreso de idiomas. Se guarda siempre en el navegador y, con `sync` activo
 * (cuenta de Google), también en el servidor para tenerlo en cualquier equipo.
 */
export function useProgress(language: string, userId?: string | null, sync = false) {
  const storageKey = userId ? `${KEY}:${userId}` : KEY;
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("off");
  // Cuenta cuyo progreso del servidor ya se fusionó (hasta entonces no se sube nada).
  const [pulledKey, setPulledKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // Clave ya cargada: evita guardar el progreso de otro usuario al cambiar de cuenta.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === storageKey;

  useEffect(() => {
    let next: Progress = EMPTY;
    try {
      // La primera vez que entra una cuenta se adopta el progreso anónimo previo del navegador.
      const raw = localStorage.getItem(storageKey) ?? (userId ? localStorage.getItem(KEY) : null);
      if (raw) next = normalizeDay({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* progreso corrupto: se empieza de cero */
    }
    setProgress(next);
    setLoadedKey(storageKey);
  }, [storageKey, userId]);

  useEffect(() => {
    if (loaded) localStorage.setItem(storageKey, JSON.stringify(progress));
  }, [progress, loaded, storageKey]);

  // Al entrar: baja el progreso del servidor y lo fusiona con el local.
  useEffect(() => {
    if (!sync || !loaded) {
      setSyncStatus("off");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSyncStatus("syncing");
    fetch("/api/progress")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const { data } = (await r.json()) as { data: Progress | null };
        if (cancelled) return;
        if (data) setProgress((p) => normalizeDay(mergeProgress(p, { ...EMPTY, ...data })));
        setPulledKey(storageKey);
        setSyncStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setSyncStatus("error");
        // Servidor o base de datos no disponibles: se reintenta más tarde.
        timer = setTimeout(() => setRetry((n) => n + 1), 30_000);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sync, loaded, storageKey, retry]);

  // Sube los cambios (con una pequeña espera para agrupar varios seguidos).
  useEffect(() => {
    if (!sync || pulledKey !== storageKey) return;
    const timer = setTimeout(() => {
      setSyncStatus("syncing");
      fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: progress }),
      })
        .then((r) => setSyncStatus(r.ok ? "ok" : "error"))
        .catch(() => setSyncStatus("error"));
    }, 2000);
    return () => clearTimeout(timer);
  }, [progress, sync, pulledKey, storageKey]);

  // Al cerrar o ocultar la pestaña, guarda lo pendiente.
  useEffect(() => {
    if (!sync || pulledKey !== storageKey) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: progressRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [sync, pulledKey, storageKey]);

  const updateLang = useCallback(
    (fn: (l: LangProgress) => LangProgress) =>
      setProgress((p) => ({
        ...p,
        langs: { ...p.langs, [language]: fn(p.langs[language] ?? emptyLang()) },
      })),
    [language]
  );

  const addXp = useCallback(
    (amount: number) => {
      if (amount <= 0) return;
      setProgress((p) => {
        const today = day();
        const base = normalizeDay(p);
        const firstToday = base.lastDay !== today;
        const lang = base.langs[language] ?? emptyLang();
        return {
          ...base,
          streak: firstToday ? base.streak + 1 : base.streak,
          lastDay: today,
          todayXp: base.todayXp + amount,
          langs: {
            ...base.langs,
            [language]: { ...lang, xp: lang.xp + amount, daily: addDaily(lang.daily, today, amount) },
          },
        };
      });
    },
    [language]
  );

  /** Registra una respuesta: actualiza aciertos, calendario de repaso y estadística del ejercicio. */
  const recordWord = useCallback(
    (w: Word, correct: boolean, kind?: string) =>
      updateLang((l) => {
        const prev = l.words[w.word];
        const now = Date.now();
        const exercises = kind
          ? {
              ...(l.exercises ?? {}),
              [kind]: {
                ok: (l.exercises?.[kind]?.ok ?? 0) + (correct ? 1 : 0),
                total: (l.exercises?.[kind]?.total ?? 0) + 1,
              },
            }
          : l.exercises;
        return {
          ...l,
          exercises,
          words: {
            ...l.words,
            [w.word]: {
              ...w,
              ...schedule(prev, correct, now),
              seen: (prev?.seen ?? 0) + 1,
              correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
              wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
              lastSeen: now,
            },
          },
        };
      }),
    [updateLang]
  );

  /** Añade palabras aún no practicadas (p. ej. vocabulario de una serie): tocan repaso ya. */
  const addWords = useCallback(
    (words: Word[]) =>
      updateLang((l) => {
        const next = { ...l.words };
        const now = Date.now();
        for (const w of words) {
          next[w.word] ??= { ...w, seen: 0, correct: 0, wrong: 0, lastSeen: now, reps: 0, ease: 2.5, interval: 0, due: now };
        }
        return { ...l, words: next };
      }),
    [updateLang]
  );

  const setPlacement = useCallback(
    (record: PlacementRecord) => updateLang((l) => ({ ...l, placement: record })),
    [updateLang]
  );

  const completeLesson = useCallback(
    (key: string, stars: number) =>
      updateLang((l) => ({
        ...l,
        completed: { ...l.completed, [key]: Math.max(stars, l.completed[key] ?? 0) },
      })),
    [updateLang]
  );

  const recordMedia = useCallback(
    (key: string, title: string, score: number) =>
      updateLang((l) => {
        const prev = l.media[key];
        return {
          ...l,
          media: {
            ...l.media,
            [key]: {
              title,
              reps: (prev?.reps ?? 0) + 1,
              best: Math.max(prev?.best ?? 0, score),
              lastPlayed: Date.now(),
            },
          },
        };
      }),
    [updateLang]
  );

  const setGameBest = useCallback(
    (game: "pairsBest" | "rushBest", value: number) =>
      updateLang((l) => {
        const prev = l.games[game];
        // Parejas: menos segundos es mejor. Contrarreloj: más puntos es mejor.
        const better =
          prev === undefined || (game === "pairsBest" ? value < prev : value > prev);
        return better ? { ...l, games: { ...l.games, [game]: value } } : l;
      }),
    [updateLang]
  );

  return {
    loaded,
    syncStatus,
    progress,
    lang: progress.langs[language] ?? emptyLang(),
    addXp,
    recordWord,
    addWords,
    completeLesson,
    recordMedia,
    setGameBest,
    setPlacement,
  };
}

export type ProgressApi = ReturnType<typeof useProgress>;

/** Caché simple en localStorage para no repetir llamadas a la IA. */
export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno: se ignora */
  }
}
