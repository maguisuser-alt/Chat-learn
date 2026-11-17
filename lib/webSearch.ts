import type { WikiArticle } from "@/lib/wikipedia";

/** Resultado de búsqueda normalizado (mismo formato que los artículos de Wikipedia). */
export type SearchHit = WikiArticle & { published?: string; source: "exa" | "tavily" | "openalex" };

const TIMEOUT_MS = 15_000;

/** Texto compacto de los fragmentos de Exa o Tavily, para no llenar el contexto del modelo. */
const clip = (s: string, max = 1500) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Exa /search con la petición recomendada (type auto + highlights) y el
 * `objective` de la búsqueda cuando forma parte de una tarea mayor.
 */
async function exaSearch(query: string, objective?: string): Promise<SearchHit[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];
  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query, ...(objective ? { objective } : {}), type: "auto", contents: { highlights: true } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Exa ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as {
    results?: { title?: string; url: string; publishedDate?: string; highlights?: string[] }[];
  };
  return (j.results ?? [])
    .filter((x) => x.url)
    .map((x) => ({
      title: x.title?.trim() || x.url,
      url: x.url,
      extract: clip((x.highlights ?? []).join(" … ")),
      published: x.publishedDate,
      source: "exa" as const,
    }));
}

/** Tavily: respaldo cuando Exa falla o no está configurado. */
async function tavilySearch(query: string): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Tavily ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { results?: { title?: string; url: string; content?: string; published_date?: string }[] };
  return (j.results ?? [])
    .filter((x) => x.url)
    .map((x) => ({
      title: x.title?.trim() || x.url,
      url: x.url,
      extract: clip(x.content ?? ""),
      published: x.published_date,
      source: "tavily" as const,
    }));
}

export const webSearchAvailable = () => !!(process.env.EXA_API_KEY || process.env.TAVILY_API_KEY);

/** Búsqueda web: Exa y, si falla o no encuentra nada, Tavily. Nunca lanza: ante error devuelve []. */
export async function searchWeb(query: string, objective?: string): Promise<SearchHit[]> {
  try {
    const hits = await exaSearch(query, objective);
    if (hits.length) return hits;
  } catch (err) {
    console.warn("[search] Exa:", err instanceof Error ? err.message : err);
  }
  try {
    return await tavilySearch(query);
  } catch (err) {
    console.warn("[search] Tavily:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** OpenAlex reconstruye el resumen a partir de un índice invertido (palabra → posiciones). */
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
}

/** Artículos académicos de OpenAlex (más de 250 M de trabajos). Nunca lanza. */
export async function searchPapers(query: string, max = 5): Promise<SearchHit[]> {
  try {
    const url = new URL("https://api.openalex.org/works");
    url.search = new URLSearchParams({
      search: query,
      per_page: String(max),
      select: "id,doi,display_name,publication_year,abstract_inverted_index,authorships,open_access,primary_location,cited_by_count",
      ...(process.env.OPENALEX_API_KEY ? { api_key: process.env.OPENALEX_API_KEY } : {}),
    }).toString();
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`OpenAlex ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = (await r.json()) as {
      results?: {
        id: string;
        doi?: string | null;
        display_name?: string;
        publication_year?: number;
        abstract_inverted_index?: Record<string, number[]> | null;
        authorships?: { author?: { display_name?: string } }[];
        open_access?: { oa_url?: string | null };
        primary_location?: { source?: { display_name?: string } | null } | null;
        cited_by_count?: number;
      }[];
    };
    return (j.results ?? []).map((w) => {
      const authors = (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean);
      const meta = [
        authors.length ? `${authors.slice(0, 3).join(", ")}${authors.length > 3 ? " et al." : ""}` : "",
        w.publication_year ? String(w.publication_year) : "",
        w.primary_location?.source?.display_name ?? "",
        typeof w.cited_by_count === "number" ? `${w.cited_by_count} citas` : "",
      ].filter(Boolean);
      return {
        title: w.display_name?.trim() || "Artículo académico",
        url: w.open_access?.oa_url || w.doi || w.id,
        extract: clip(`${meta.join(" · ")}. ${abstractFromIndex(w.abstract_inverted_index)}`),
        published: w.publication_year ? String(w.publication_year) : undefined,
        source: "openalex" as const,
      };
    });
  } catch (err) {
    console.warn("[search] OpenAlex:", err instanceof Error ? err.message : err);
    return [];
  }
}
