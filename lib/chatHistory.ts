"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatUIMessage } from "@/lib/types";
import { planChatSync, type RemoteChatMeta, type SyncState } from "@/lib/syncMerge";

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
/** Tamaño máximo de un chat al subirlo (límite de 4,5 MB por petición de Vercel). */
const MAX_CLOUD_BYTES = 3_400_000;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());

/** Título a partir del primer mensaje del usuario. */
export function titleFrom(messages: ChatUIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";
  if (!text) return "Nuevo chat";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/** Quita lo que no debe ocupar espacio en el historial: archivos grandes. */
function compact(messages: ChatUIMessage[], maxFile = MAX_INLINE_FILE): ChatUIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "file" && p.url.length > maxFile ? { ...p, url: "" } : p)),
  }));
}

/** Cuerpo para subir un chat; si es muy grande se quitan los archivos adjuntos. */
function cloudBody(chat: StoredChat): string | null {
  const body = (messages: ChatUIMessage[]) =>
    JSON.stringify({ chat: { title: chat.title, gemId: chat.gemId ?? null, updatedAt: chat.updatedAt, messages } });
  let text = body(chat.messages);
  if (text.length > MAX_CLOUD_BYTES) text = body(compact(chat.messages, 0));
  return text.length > MAX_CLOUD_BYTES ? null : text;
}

function emptyChat(gemId?: string | null): StoredChat {
  return { id: newId(), title: "Nuevo chat", updatedAt: Date.now(), gemId: gemId ?? null, messages: [] };
}

/** Ejecuta tareas con un máximo de `n` a la vez. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    })
  );
}

/**
 * Historial de conversaciones del chat de consulta. Se guarda en el navegador
 * y, con `sync` (cuenta de Google), también en MongoDB chat a chat, para verlo
 * en cualquier dispositivo.
 */
export function useChatHistory(userId: string | null, sync = false) {
  const key = `lingua-chats:${userId ?? "anon"}`;
  const tombKey = `lingua-chats-deleted:${userId ?? "anon"}`;
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === key;
  const keyRef = useRef(key);
  keyRef.current = key;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // Sincronización
  const [syncStatus, setSyncStatus] = useState<SyncState>("off");
  /** Sube cuando un chat abierto se reemplaza por una versión de otro dispositivo (para recargarlo). */
  const [revision, setRevision] = useState(0);
  const [pulledKey, setPulledKey] = useState<string | null>(null);
  const [pullTick, setPullTick] = useState(0);
  const [flushTick, setFlushTick] = useState(0);
  /** Chats con cambios sin subir. */
  const dirty = useRef(new Set<string>());
  /** Chats borrados aquí cuyo borrado aún no llegó al servidor (id → momento). */
  const tombs = useRef<Record<string, number>>({});
  /** Borrar todo el historial en el servidor (pendiente). */
  const wipeAll = useRef(false);

  const saveTombs = useCallback(() => {
    try {
      localStorage.setItem(tombKey, JSON.stringify(tombs.current));
    } catch {
      /* almacenamiento lleno */
    }
  }, [tombKey]);

  useEffect(() => {
    let list: StoredChat[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) list = (JSON.parse(raw) as StoredChat[]).filter((c) => c && c.id && Array.isArray(c.messages));
    } catch {
      list = [];
    }
    try {
      tombs.current = JSON.parse(localStorage.getItem(tombKey) ?? "{}") ?? {};
    } catch {
      tombs.current = {};
    }
    dirty.current = new Set();
    setChats(list);
    setActiveId(null);
    setPulledKey(null);
    setLoadedKey(key);
  }, [key, tombKey]);

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

  /** Marca un chat para subirlo. */
  const markDirty = useCallback((id: string) => {
    dirty.current.add(id);
    setFlushTick((n) => n + 1);
  }, []);

  // Bajar del servidor: índice de chats y, de los que cambiaron, el chat completo.
  useEffect(() => {
    if (!sync || !loaded) {
      setSyncStatus("off");
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      setSyncStatus("syncing");
      const r = await fetch("/api/sync/chats", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const { chats: remote } = (await r.json()) as { chats: RemoteChatMeta[] };
      const plan = planChatSync(
        chatsRef.current.map((c) => ({ id: c.id, updatedAt: c.updatedAt })),
        remote,
        tombs.current
      );
      // Historial borrado aquí y aún sin confirmar en el servidor: no se vuelve a bajar.
      if (wipeAll.current) plan.download.length = 0;
      const downloaded: StoredChat[] = [];
      let failed = false;
      await pool(plan.download, 4, async (id) => {
        const res = await fetch(`/api/sync/chats/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
        if (res?.ok) {
          const { chat } = (await res.json()) as { chat: StoredChat };
          downloaded.push({ ...chat, gemId: chat.gemId ?? null, messages: compact(chat.messages) });
        } else if (res?.status !== 404) failed = true;
      });
      if (cancelled) return;

      if (downloaded.length || plan.removeLocal.length) {
        const gone = new Set(plan.removeLocal);
        setChats((prev) => {
          const map = new Map(prev.filter((c) => !gone.has(c.id)).map((c) => [c.id, c]));
          for (const d of downloaded) {
            const cur = map.get(d.id);
            if (!cur || d.updatedAt > cur.updatedAt) map.set(d.id, d);
          }
          const list = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
          persist(list);
          return list;
        });
        const active = activeRef.current;
        if (active && (gone.has(active) || downloaded.some((d) => d.id === active))) setRevision((n) => n + 1);
      }
      plan.upload.forEach((id) => dirty.current.add(id));
      for (const id of plan.deleteRemote) tombs.current[id] ??= Date.now();
      setPulledKey(key);
      setSyncStatus(failed ? "error" : "ok");
      setFlushTick((n) => n + 1);
    })().catch(() => {
      if (cancelled) return;
      setSyncStatus("error");
      retry = setTimeout(() => setPullTick((n) => n + 1), 30_000);
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [sync, loaded, key, pullTick, persist]);

  // Al volver a la pestaña se buscan chats nuevos de otros dispositivos.
  useEffect(() => {
    if (!sync) return;
    const onVisible = () => document.visibilityState === "visible" && setPullTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  // Subir cambios y borrados pendientes (agrupados).
  const ready = sync && loaded && pulledKey === key;
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      if (!dirty.current.size && !Object.keys(tombs.current).length && !wipeAll.current) return;
      setSyncStatus("syncing");
      let ok = true;
      if (wipeAll.current) {
        const r = await fetch("/api/sync/chats", { method: "DELETE" }).catch(() => null);
        if (r?.ok) wipeAll.current = false;
        else ok = false;
      }
      for (const id of Object.keys(tombs.current)) {
        const r = await fetch(`/api/sync/chats/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
        if (r?.ok) delete tombs.current[id];
        else ok = false;
      }
      saveTombs();
      for (const id of [...dirty.current]) {
        const chat = chatsRef.current.find((c) => c.id === id);
        dirty.current.delete(id);
        if (!chat) continue;
        const body = cloudBody(chat);
        if (!body) continue; // demasiado grande incluso sin archivos: se queda solo en este navegador
        const r = await fetch(`/api/sync/chats/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        }).catch(() => null);
        if (!r?.ok) {
          dirty.current.add(id);
          ok = false;
        } else if ((await r.json().catch(() => ({}))).stale) {
          setPullTick((n) => n + 1); // otro dispositivo lo cambió después: se baja su versión
        }
      }
      setSyncStatus(ok ? "ok" : "error");
    }, 1500);
    return () => clearTimeout(timer);
  }, [ready, flushTick, saveTombs]);

  // Al ocultar la pestaña se suben los chats pendientes pequeños (keepalive admite hasta 64 KB).
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      for (const id of [...dirty.current]) {
        const chat = chatsRef.current.find((c) => c.id === id);
        const body = chat && cloudBody(chat);
        if (!body || body.length > 60_000) continue;
        dirty.current.delete(id);
        fetch(`/api/sync/chats/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => dirty.current.add(id));
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [ready]);

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
      markDirty(chat.id);
    },
    [persist, markDirty]
  );

  const setGem = useCallback(
    (chat: StoredChat, gemId: string | null) => {
      if (!chats.some((c) => c.id === chat.id)) {
        setDraft((d) => ({ ...d, gemId }));
        return;
      }
      setChats((prev) => {
        const list = prev.map((c) => (c.id === chat.id ? { ...c, gemId, updatedAt: Date.now() } : c));
        persist(list);
        return list;
      });
      markDirty(chat.id);
    },
    [chats, persist, markDirty]
  );

  const rename = useCallback(
    (id: string, title: string) => {
      setChats((prev) => {
        const list = prev.map((c) =>
          c.id === id ? { ...c, title: title.trim().slice(0, 80) || c.title, updatedAt: Date.now() } : c
        );
        persist(list);
        return list;
      });
      markDirty(id);
    },
    [persist, markDirty]
  );

  const remove = useCallback(
    (id: string) => {
      setChats((prev) => {
        const list = prev.filter((c) => c.id !== id);
        persist(list);
        return list;
      });
      dirty.current.delete(id);
      tombs.current[id] = Date.now();
      saveTombs();
      setFlushTick((n) => n + 1);
      if (activeId === id) newChat();
    },
    [activeId, newChat, persist, saveTombs]
  );

  /** Borra todo el historial (también en el servidor y, por tanto, en los demás dispositivos). */
  const clearAll = useCallback(() => {
    localStorage.removeItem(keyRef.current);
    dirty.current.clear();
    if (sync) wipeAll.current = true;
    setChats([]);
    setFlushTick((n) => n + 1);
    newChat();
  }, [newChat, sync]);

  return { loaded, chats, active, revision, syncStatus, newChat, select, saveMessages, setGem, rename, remove, clearAll };
}

export type ChatHistoryApi = ReturnType<typeof useChatHistory>;
