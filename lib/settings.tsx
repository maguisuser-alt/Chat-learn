"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useCloudDoc } from "@/lib/useCloudDoc";
import { mergeSettings, type SyncState } from "@/lib/syncMerge";

export type ResponseLength = "breve" | "normal" | "detallada";
export type VoiceEngine = "browser" | "natural";

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}

/** Asistente personalizado (como los "Gems" de Gemini o los GPTs). */
export interface Gem {
  id: string;
  name: string;
  emoji: string;
  instructions: string;
}

export interface Settings {
  personalization: { about: string; style: string; length: ResponseLength };
  memoryEnabled: boolean;
  memories: Memory[];
  gems: Gem[];
  reasoningDefault: boolean;
  voice: { engine: VoiceEngine; name: string; autoRead: boolean; dictationLang: string };
  /** Momento del último cambio (para fusionar entre dispositivos). */
  updatedAt: number;
  /** Ids de memorias y asistentes borrados (para que el borrado llegue a otros dispositivos). */
  removed: string[];
}

export const LIMITS = { about: 1500, style: 1500, gemInstructions: 4000, memory: 200, memories: 60, gems: 30 };

export const DEFAULT_SETTINGS: Settings = {
  personalization: { about: "", style: "", length: "normal" },
  memoryEnabled: true,
  memories: [],
  gems: [],
  reasoningDefault: false,
  voice: { engine: "browser", name: "Kore", autoRead: false, dictationLang: "es-ES" },
  updatedAt: 0,
  removed: [],
};

/** Plantillas para crear asistentes con un clic. */
export const GEM_TEMPLATES: Omit<Gem, "id">[] = [
  {
    emoji: "🧑‍🏫",
    name: "Profesor socrático",
    instructions:
      "No des la respuesta directamente. Guía al estudiante con preguntas cortas, una a la vez, para que llegue él mismo a la solución. Si se atasca dos veces, dale una pista concreta.",
  },
  {
    emoji: "✍️",
    name: "Corrector de textos",
    instructions:
      "Corrige ortografía, gramática y estilo del texto que te den. Devuelve primero el texto corregido y después una lista breve de los cambios importantes y por qué.",
  },
  {
    emoji: "🧒",
    name: "Explicador para niños",
    instructions:
      "Explica todo como si hablaras con un niño de 10 años: frases cortas, comparaciones con cosas cotidianas y sin tecnicismos. Termina con una pregunta divertida para comprobar que lo entendió.",
  },
  {
    emoji: "📝",
    name: "Creador de exámenes",
    instructions:
      "Con el tema o texto que te den, crea un examen de práctica: 5 preguntas de opción múltiple y 2 de desarrollo. Pon las respuestas correctas al final, separadas, para que el estudiante pueda autocorregirse.",
  },
];

/** Voces naturales de Gemini (deben coincidir con `VOICES` en lib/media.ts). */
export const VOICE_OPTIONS = [
  { id: "Kore", label: "Kore · firme" },
  { id: "Puck", label: "Puck · animada" },
  { id: "Charon", label: "Charon · informativa" },
  { id: "Aoede", label: "Aoede · ligera" },
  { id: "Fenrir", label: "Fenrir · enérgica" },
  { id: "Leda", label: "Leda · juvenil" },
] as const;

export const DICTATION_LANGS = [
  { id: "es-ES", label: "Español (España)" },
  { id: "es-MX", label: "Español (México)" },
  { id: "es-US", label: "Español (EE. UU.)" },
  { id: "en-US", label: "Inglés (EE. UU.)" },
  { id: "pt-BR", label: "Portugués (Brasil)" },
  { id: "fr-FR", label: "Francés" },
] as const;

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());

/** Combina lo guardado con los valores por defecto (por si faltan campos de versiones anteriores). */
function normalize(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  return {
    personalization: { ...DEFAULT_SETTINGS.personalization, ...(s.personalization ?? {}) },
    memoryEnabled: s.memoryEnabled ?? DEFAULT_SETTINGS.memoryEnabled,
    memories: Array.isArray(s.memories) ? s.memories : [],
    gems: Array.isArray(s.gems) ? s.gems : [],
    reasoningDefault: s.reasoningDefault ?? false,
    voice: { ...DEFAULT_SETTINGS.voice, ...(s.voice ?? {}) },
    updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
    removed: Array.isArray(s.removed) ? s.removed.filter((x) => typeof x === "string") : [],
  };
}

/** Marca el cambio con la hora, para que gane frente a copias más antiguas de otros dispositivos. */
const touched = (s: Settings): Settings => ({ ...s, updatedAt: Date.now() });

interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  addMemory: (text: string) => void;
  removeMemory: (id: string) => void;
  saveGem: (gem: Gem) => void;
  removeGem: (id: string) => void;
  /** Estado de la sincronización con la cuenta. */
  syncStatus: SyncState;
}

const SettingsContext = createContext<SettingsApi | null>(null);

/** Ajustes de la cuenta, guardados en el navegador (separados por usuario). */
export function SettingsProvider({
  userId,
  sync = false,
  children,
}: {
  userId: string | null;
  /** Sincronizar con la cuenta (MongoDB). */
  sync?: boolean;
  children: React.ReactNode;
}) {
  const key = `lingua-settings:${userId ?? "anon"}`;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setSettings(raw ? normalize(JSON.parse(raw)) : DEFAULT_SETTINGS);
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
    setLoadedKey(key);
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      /* almacenamiento lleno */
    }
  }, [settings, key, loadedKey]);

  const syncStatus = useCloudDoc<Settings>({
    kind: "settings",
    enabled: sync,
    loadedKey: loadedKey === key ? key : null,
    value: settings,
    apply: (fn) => setSettings((s) => fn(s)),
    merge: (local, remote) => mergeSettings(local, normalize(remote), LIMITS.memories, LIMITS.gems),
  });

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => touched({ ...s, ...patch })), []);

  const addMemory = useCallback(
    (text: string) =>
      setSettings((s) => {
        const t = text.trim().slice(0, LIMITS.memory);
        if (!t) return s;
        // Evita duplicados casi idénticos.
        const norm = (x: string) => x.toLowerCase().replace(/\W+/g, " ").trim();
        if (s.memories.some((m) => norm(m.text) === norm(t))) return s;
        const memories = [...s.memories, { id: uid(), text: t, createdAt: Date.now() }].slice(-LIMITS.memories);
        return touched({ ...s, memories });
      }),
    []
  );

  const removeMemory = useCallback(
    (id: string) =>
      setSettings((s) => touched({ ...s, memories: s.memories.filter((m) => m.id !== id), removed: [...s.removed, id].slice(-400) })),
    []
  );

  const saveGem = useCallback(
    (gem: Gem) =>
      setSettings((s) => {
        const clean: Gem = {
          ...gem,
          name: gem.name.trim().slice(0, 60) || "Asistente",
          emoji: gem.emoji.trim().slice(0, 4) || "🤖",
          instructions: gem.instructions.slice(0, LIMITS.gemInstructions),
        };
        const exists = s.gems.some((g) => g.id === gem.id);
        const gems = exists ? s.gems.map((g) => (g.id === gem.id ? clean : g)) : [...s.gems, clean].slice(-LIMITS.gems);
        return touched({ ...s, gems });
      }),
    []
  );

  const removeGem = useCallback(
    (id: string) =>
      setSettings((s) => touched({ ...s, gems: s.gems.filter((g) => g.id !== id), removed: [...s.removed, id].slice(-400) })),
    []
  );

  const api = useMemo(
    () => ({ settings, update, addMemory, removeMemory, saveGem, removeGem, syncStatus }),
    [settings, update, addMemory, removeMemory, saveGem, removeGem, syncStatus]
  );
  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings debe usarse dentro de <SettingsProvider>");
  return ctx;
}

/** Datos de personalización que se envían con cada mensaje del chat. */
export function chatContext(s: Settings, gemId?: string | null) {
  const gem = gemId ? s.gems.find((g) => g.id === gemId) : undefined;
  return {
    personalization: s.personalization,
    memoryEnabled: s.memoryEnabled,
    memories: s.memoryEnabled ? s.memories.map((m) => m.text) : [],
    gem: gem ? { name: gem.name, instructions: gem.instructions } : undefined,
  };
}
