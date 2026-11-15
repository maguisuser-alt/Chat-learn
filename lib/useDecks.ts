"use client";

import { useCallback, useEffect, useState } from "react";
import { dueWords } from "@/lib/srs";
import { newCards, reviewCard, type Deck } from "@/lib/study";
import { mergeDecks, type DeckStore } from "@/lib/syncMerge";
import { useCloudDoc } from "@/lib/useCloudDoc";

const KEY = "lingua-decks";
const EMPTY: DeckStore = { decks: [], removed: {} };

/** Admite el formato antiguo (solo la lista de mazos). */
function parseStore(raw: unknown): DeckStore {
  if (Array.isArray(raw)) return { decks: raw as Deck[], removed: {} };
  const s = (raw ?? {}) as Partial<DeckStore>;
  return {
    decks: Array.isArray(s.decks) ? s.decks.filter((d) => d && d.id && Array.isArray(d.cards)) : [],
    removed: s.removed && typeof s.removed === "object" ? s.removed : {},
  };
}

/**
 * Mazos de tarjetas de estudio. Se guardan en el navegador por usuario y, con
 * cuenta de Google, también en MongoDB para tenerlos en cualquier dispositivo.
 */
export function useDecks(userId: string | null, sync = false) {
  const storageKey = userId ? `${KEY}:${userId}` : KEY;
  const [store, setStore] = useState<DeckStore>(EMPTY);
  // Clave ya cargada: evita escribir los mazos de otra cuenta al cambiar de usuario.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === storageKey;
  const decks = store.decks;

  useEffect(() => {
    let next = EMPTY;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) next = parseStore(JSON.parse(raw));
    } catch {
      /* datos corruptos: se empieza de cero */
    }
    setStore(next);
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(store));
    } catch {
      /* almacenamiento lleno */
    }
  }, [store, loaded, storageKey]);

  const syncStatus = useCloudDoc<DeckStore>({
    kind: "decks",
    enabled: sync,
    loadedKey: loaded ? storageKey : null,
    value: store,
    apply: (fn) => setStore((s) => fn(s)),
    merge: (local, remote) => mergeDecks(local, parseStore(remote)),
  });

  /** Cambia un mazo y marca la hora del cambio. */
  const editDeck = useCallback(
    (id: string, fn: (d: Deck) => Deck) =>
      setStore((s) => ({ ...s, decks: s.decks.map((x) => (x.id === id ? { ...fn(x), updatedAt: Date.now() } : x)) })),
    []
  );

  const addDeck = useCallback((deck: Deck) => setStore((s) => ({ ...s, decks: [deck, ...s.decks] })), []);

  const removeDeck = useCallback(
    (id: string) =>
      setStore((s) => ({ decks: s.decks.filter((x) => x.id !== id), removed: { ...s.removed, [id]: Date.now() } })),
    []
  );

  const renameDeck = useCallback(
    (id: string, title: string) => editDeck(id, (x) => ({ ...x, title: title.trim() || x.title })),
    [editDeck]
  );

  /** Añade tarjetas a un mazo existente (sin duplicar anversos). Devuelve cuántas se añadieron. */
  const addCards = useCallback(
    (id: string, raw: { front: string; back: string }[]) => {
      const deck = decks.find((x) => x.id === id);
      if (!deck) return 0;
      const fresh = newCards(raw, Date.now(), deck.cards);
      if (fresh.length) editDeck(id, (x) => ({ ...x, cards: [...x.cards, ...fresh] }));
      return fresh.length;
    },
    [decks, editDeck]
  );

  const removeCard = useCallback(
    (deckId: string, cardId: string) =>
      editDeck(deckId, (x) => ({
        ...x,
        cards: x.cards.filter((c) => c.id !== cardId),
        removedCards: [...(x.removedCards ?? []), cardId].slice(-400),
      })),
    [editDeck]
  );

  const review = useCallback(
    (deckId: string, cardId: string, correct: boolean) => {
      const now = Date.now();
      editDeck(deckId, (x) => ({ ...x, cards: x.cards.map((c) => (c.id === cardId ? reviewCard(c, correct, now) : c)) }));
    },
    [editDeck]
  );

  const dueCount = decks.reduce((n, d) => n + dueWords(d.cards, Date.now(), Infinity).length, 0);

  return { loaded, decks, addDeck, removeDeck, renameDeck, addCards, removeCard, review, dueCount, syncStatus };
}

export type DecksApi = ReturnType<typeof useDecks>;
