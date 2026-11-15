"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatUIMessage } from "@/lib/types";

export interface StoredChat {
  id: string;
  title: string;
  updatedAt: number;
  gemId?: string | null;
  messages: ChatUIMessage[];
}

const MAX_CHATS = 50;
/** Las imágenes o audios grandes no se guardan en el historial (llenarían el almacenamiento). */
const MAX_INLINE_FILE = 200_000;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());

/** Título a partir del primer mensaje del usuario. */
export function titleFrom(messages: ChatUIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";
  if (!text) return "Nuevo chat";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/** Quita lo que no debe ocupar espacio en el historial: archivos grandes y pensamientos. */
function compact(messages: ChatUIMessage[]): ChatUIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "file" && p.url.length > MAX_INLINE_FILE ? { ...p, url: "" } : p
    ),
  }));
}

function emptyChat(gemId?: string | null): StoredChat {
  return { id: newId(), title: "Nuevo chat", updatedAt: Date.now(), gemId: gemId ?? null, messages: [] };
}

/** Historial de conversaciones del chat de consulta, guardado en el navegador. */
export function useChatHistory(userId: string | null) {
  const key = `lingua-chats:${userId ?? "anon"}`;
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let list: StoredChat[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) list = (JSON.parse(raw) as StoredChat[]).filter((c) => c && c.id && Array.isArray(c.messages));
    } catch {
      list = [];
    }
    setChats(list);
    setActiveId(null);
    setLoaded(true);
  }, [key]);

  const persist = useCallback((list: StoredChat[]) => {
    // Si no cabe, se van descartando los chats más antiguos.
    let current = list;
    while (current.length) {
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(current));
        return;
      } catch {
        current = current.slice(0, -1);
      }
    }
    localStorage.removeItem(keyRef.current);
  }, []);

  /** Chat activo; si no hay uno elegido se usa un chat nuevo (sin guardar hasta el primer mensaje). */
  const [draft, setDraft] = useState<StoredChat>(() => emptyChat());
  const active = chats.find((c) => c.id === activeId) ?? draft;

  const newChat = useCallback((gemId?: string | null) => {
    setDraft(emptyChat(gemId));
    setActiveId(null);
  }, []);

  const select = useCallback((id: string) => setActiveId(id), []);

  /** Guarda los mensajes de un chat (lo crea en el historial si era nuevo). */
  const saveMessages = useCallback(
    (chat: StoredChat, messages: ChatUIMessage[]) => {
      if (!messages.length) return;
      setChats((prev) => {
        const updated: StoredChat = {
          ...chat,
          title: chat.title === "Nuevo chat" ? titleFrom(messages) : chat.title,
          updatedAt: Date.now(),
          messages: compact(messages),
        };
        const list = [updated, ...prev.filter((c) => c.id !== chat.id)].slice(0, MAX_CHATS);
        persist(list);
        return list;
      });
      setActiveId(chat.id);
    },
    [persist]
  );

  const setGem = useCallback(
    (chat: StoredChat, gemId: string | null) => {
      if (!chats.some((c) => c.id === chat.id)) {
        setDraft((d) => ({ ...d, gemId }));
        return;
      }
      setChats((prev) => {
        const list = prev.map((c) => (c.id === chat.id ? { ...c, gemId } : c));
        persist(list);
        return list;
      });
    },
    [chats, persist]
  );

  const rename = useCallback(
    (id: string, title: string) =>
      setChats((prev) => {
        const list = prev.map((c) => (c.id === id ? { ...c, title: title.trim().slice(0, 80) || c.title } : c));
        persist(list);
        return list;
      }),
    [persist]
  );

  const remove = useCallback(
    (id: string) => {
      setChats((prev) => {
        const list = prev.filter((c) => c.id !== id);
        persist(list);
        return list;
      });
      if (activeId === id) newChat();
    },
    [activeId, newChat, persist]
  );

  const clearAll = useCallback(() => {
    localStorage.removeItem(keyRef.current);
    setChats([]);
    newChat();
  }, [newChat]);

  return { loaded, chats, active, newChat, select, saveMessages, setGem, rename, remove, clearAll };
}

export type ChatHistoryApi = ReturnType<typeof useChatHistory>;
