export interface WikiArticle {
  title: string;
  url: string;
  extract: string;
}

const UA = "LinguaTutor/0.1 (app educativa; contacto local)";

/**
 * Busca la consulta en Wikipedia y devuelve la introducción de los artículos
 * más relevantes. Sin API key. Ante cualquier error devuelve [].
 */
export async function researchWikipedia(query: string, lang = "es", max = 3): Promise<WikiArticle[]> {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  try {
    const search = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query.slice(0, 200),
      srlimit: String(max),
      format: "json",
      utf8: "1",
    });
    const sr = await fetch(`${api}?${search}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5_000),
    });
    if (!sr.ok) return [];
    const hits = ((await sr.json()) as { query?: { search?: { pageid: number }[] } }).query?.search ?? [];
    if (hits.length === 0) return [];

    const ids = hits.map((h) => h.pageid);
    const ex = new URLSearchParams({
      action: "query",
      prop: "extracts|info",
      inprop: "url",
      exintro: "1",
      explaintext: "1",
      exlimit: String(ids.length),
      pageids: ids.join("|"),
      format: "json",
      utf8: "1",
    });
    const er = await fetch(`${api}?${ex}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5_000),
    });
    if (!er.ok) return [];
    const pages =
      ((await er.json()) as {
        query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
      }).query?.pages ?? {};

    // Respeta el orden de relevancia de la búsqueda.
    return ids
      .map((id) => pages[String(id)])
      .filter((p) => p?.extract && p.extract.length > 80)
      .map((p) => ({
        title: p.title,
        url: p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
        extract: p.extract!.slice(0, 2_500),
      }));
  } catch (err) {
    console.warn("[wikipedia]", err);
    return [];
  }
}
