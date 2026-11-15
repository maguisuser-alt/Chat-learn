"use client";

import { useCallback, useEffect, useState } from "react";
import { dueWords } from "@/lib/srs";
import { newCards, reviewCard, type Deck } from "@/lib/study";

const KEY = "lingua-decks";

/** Mazos de tarjetas de estudio, guardados en el navegador por usuario. */
export function useDecks(userId: string | null) {
  const storageKey = userId ? `${KEY}:${userId}` : KEY;
  const [decks, setDecks] = useState<Deck[]>([]);
  // Clave ya cargada: evita escribir los mazos de otra cuenta al cambiar de usuario.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === storageKey;

  useEffect(() => {
    let next: Deck[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) next = parsed;
      }
    } catch {
      /* datos corruptos: se empieza de cero */
    }
    setDecks(next);
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(decks));
    } catch {
      /* almacenamiento lleno */
    }
  }, [decks, loaded, storageKey]);

  const addDeck = useCallback((deck: Deck) => setDecks((d) => [deck, ...d]), []);

  const removeDeck = useCallback((id: string) => setDecks((d) => d.filter((x) => x.id !== id)), []);

  const renameDeck = useCallback(
    (id: string, title: string) => setDecks((d) => d.map((x) => (x.id === id ? { ...x, title: title.trim() || x.title } : x))),
    []
  );

  /** Añade tarjetas a un mazo existente (sin duplicar anversos). Devuelve cuántas se añadieron. */
  const addCards = useCallback(
    (id: string, raw: { front: string; back: string }[]) => {
      const deck = decks.find((x) => x.id === id);
      if (!deck) return 0;
      const fresh = newCards(raw, Date.now(), deck.cards);
      if (fresh.length) setDecks((d) => d.map((x) => (x.id === id ? { ...x, cards: [...x.cards, ...fresh] } : x)));
      return fresh.length;
    },
    [decks]
  );

  const removeCard = useCallback(
    (deckId: string, cardId: string) =>
      setDecks((d) => d.map((x) => (x.id === deckId ? { ...x, cards: x.cards.filter((c) => c.id !== cardId) } : x))),
    []
  );

  const review = useCallback((deckId: string, cardId: string, correct: boolean) => {
    const now = Date.now();
    setDecks((d) =>
      d.map((x) =>
        x.id === deckId ? { ...x, cards: x.cards.map((c) => (c.id === cardId ? reviewCard(c, correct, now) : c)) } : x
      )
    );
  }, []);

  const dueCount = decks.reduce((n, d) => n + dueWords(d.cards, Date.now(), Infinity).length, 0);

  return { loaded, decks, addDeck, removeDeck, renameDeck, addCards, removeCard, review, dueCount };
}

export type DecksApi = ReturnType<typeof useDecks>;
