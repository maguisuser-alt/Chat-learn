/**
 * Fusión de datos entre dispositivos. Funciones puras (sin navegador ni red)
 * para poder probarlas. Regla general: nada se pierde salvo lo que se borró a
 * propósito (para eso se guardan los identificadores borrados).
 */
import type { Gem, Memory, Settings } from "@/lib/settings";
import type { Deck, StudyCard } from "@/lib/study";

const MAX_REMOVED = 400;

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])].slice(-MAX_REMOVED);

const normText = (x: string) => x.toLowerCase().replace(/\W+/g, " ").trim();

/**
 * Ajustes: los valores sueltos (personalización, voz…) los da la copia cambiada
 * más recientemente; memorias y asistentes se unen y se quitan los borrados.
 */
export function mergeSettings(local: Settings, remote: Settings, maxMemories: number, maxGems: number): Settings {
  const newer = (remote.updatedAt ?? 0) > (local.updatedAt ?? 0) ? remote : local;
  const older = newer === remote ? local : remote;
  const removed = union(local.removed, remote.removed);
  const gone = new Set(removed);

  const memories: Memory[] = [];
  const seenText = new Set<string>();
  for (const m of [...older.memories, ...newer.memories].sort((a, b) => a.createdAt - b.createdAt)) {
    const key = normText(m.text);
    if (gone.has(m.id) || seenText.has(key) || memories.some((x) => x.id === m.id)) continue;
    seenText.add(key);
    memories.push(m);
  }

  // Mismo asistente en los dos: vale la versión de la copia más reciente.
  const gems = new Map<string, Gem>();
  for (const g of [...older.gems, ...newer.gems]) if (!gone.has(g.id)) gems.set(g.id, g);

  return {
    ...newer,
    memories: memories.slice(-maxMemories),
    gems: [...gems.values()].slice(-maxGems),
    removed,
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0),
  };
}

export interface DeckStore {
  decks: Deck[];
  /** Mazo borrado → momento del borrado. */
  removed: Record<string, number>;
}

/** De dos copias de la misma tarjeta, la que se repasó más recientemente. */
function newerCard(a: StudyCard, b: StudyCard) {
  return (b.lastSeen ?? 0) > (a.lastSeen ?? 0) || ((b.lastSeen ?? 0) === (a.lastSeen ?? 0) && b.seen > a.seen) ? b : a;
}

function mergeDeck(a: Deck, b: Deck): Deck {
  const newer = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  const removedCards = union(a.removedCards, b.removedCards);
  const gone = new Set(removedCards);
  const cards = new Map<string, StudyCard>();
  // Orden: el de la copia más reciente; las tarjetas que solo tiene la otra, al final.
  for (const c of [...newer.cards, ...(newer === a ? b : a).cards]) {
    if (gone.has(c.id)) continue;
    const prev = cards.get(c.id);
    cards.set(c.id, prev ? newerCard(prev, c) : c);
  }
  return {
    ...newer,
    cards: [...cards.values()],
    removedCards,
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
  };
}

/** Mazos: se unen por id y, dentro de cada mazo, tarjeta a tarjeta. */
export function mergeDecks(local: DeckStore, remote: DeckStore): DeckStore {
  const removed: Record<string, number> = { ...remote.removed };
  for (const [id, at] of Object.entries(local.removed)) removed[id] = Math.max(at, removed[id] ?? 0);

  const byId = new Map<string, Deck>();
  for (const d of [...local.decks, ...remote.decks]) {
    const prev = byId.get(d.id);
    byId.set(d.id, prev ? mergeDeck(prev, d) : d);
  }
  // Un mazo borrado solo revive si se cambió después del borrado.
  const decks = [...byId.values()]
    .filter((d) => !(removed[d.id] && removed[d.id] >= (d.updatedAt ?? d.createdAt)))
    .sort((a, b) => b.createdAt - a.createdAt);

  // Se olvidan los borrados de hace más de 90 días.
  const cutoff = Date.now() - 90 * 86_400_000;
  for (const [id, at] of Object.entries(removed)) if (at < cutoff) delete removed[id];
  return { decks, removed };
}

/** Documento con fecha de cambio: gana la copia más reciente. */
export function newest<T extends { updatedAt?: number }>(local: T, remote: T): T {
  return (remote.updatedAt ?? 0) > (local.updatedAt ?? 0) ? remote : local;
}

export interface ChatMeta {
  id: string;
  updatedAt: number;
}
export interface RemoteChatMeta {
  id: string;
  changedAt: number;
  deleted: boolean;
}

/**
 * Qué hacer con cada chat al comparar el historial local con el del servidor.
 * - download: el servidor tiene una versión más reciente.
 * - upload: la local es más reciente o el servidor no la tiene.
 * - removeLocal: se borró en otro dispositivo después del último cambio local.
 * - deleteRemote: se borró aquí (lápida local) y el servidor aún lo tiene.
 */
export function planChatSync(
  local: ChatMeta[],
  remote: RemoteChatMeta[],
  tombstones: Record<string, number>
): { download: string[]; upload: string[]; removeLocal: string[]; deleteRemote: string[] } {
  const plan = { download: [] as string[], upload: [] as string[], removeLocal: [] as string[], deleteRemote: [] as string[] };
  const localById = new Map(local.map((c) => [c.id, c]));
  const remoteIds = new Set<string>();

  for (const r of remote) {
    remoteIds.add(r.id);
    const l = localById.get(r.id);
    const dead = tombstones[r.id];
    if (r.deleted) {
      if (l && l.updatedAt <= r.changedAt) plan.removeLocal.push(r.id);
      else if (l) plan.upload.push(r.id); // se siguió usando aquí después del borrado
      continue;
    }
    if (dead && dead >= r.changedAt) {
      plan.deleteRemote.push(r.id);
      continue;
    }
    if (!l || r.changedAt > l.updatedAt) plan.download.push(r.id);
    else if (l.updatedAt > r.changedAt) plan.upload.push(r.id);
  }
  for (const l of local) if (!remoteIds.has(l.id)) plan.upload.push(l.id);
  for (const id of Object.keys(tombstones)) if (!remoteIds.has(id) && !localById.has(id)) plan.deleteRemote.push(id);
  return plan;
}

/** Peor estado de varias sincronizaciones (para mostrar uno solo). */
export type SyncState = "off" | "syncing" | "ok" | "error";
export function combineSync(...states: SyncState[]): SyncState {
  if (states.includes("error")) return "error";
  if (states.includes("syncing")) return "syncing";
  if (states.includes("ok")) return "ok";
  return "off";
}
