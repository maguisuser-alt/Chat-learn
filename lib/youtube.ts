export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
}

/**
 * Busca videos en YouTube. Usa la API oficial si hay YOUTUBE_API_KEY; si no,
 * lee la página pública de resultados (sin clave, puede cambiar sin aviso).
 */
export async function searchVideos(query: string, lang = "es", max = 4): Promise<VideoResult[]> {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    return key ? await searchWithApi(query, key, lang, max) : await searchScraping(query, lang, max);
  } catch (err) {
    console.warn("[youtube]", err);
    return [];
  }
}

async function searchWithApi(query: string, key: string, lang: string, max: number) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(max),
    videoEmbeddable: "true",
    safeSearch: "strict",
    relevanceLanguage: lang,
    q: query,
    key,
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = (await res.json()) as {
    items: {
      id: { videoId: string };
      snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } };
    }[];
  };
  return data.items.map((i) => ({
    id: i.id.videoId,
    title: i.snippet.title,
    channel: i.snippet.channelTitle,
    thumbnail: i.snippet.thumbnails.medium.url,
  }));
}

async function searchScraping(query: string, lang: string, max: number) {
  const res = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${lang}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": `${lang},en;q=0.8`,
        Cookie: "CONSENT=YES+1",
      },
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error("ytInitialData no encontrado");

  const found: VideoResult[] = [];
  const walk = (node: unknown) => {
    if (found.length >= max || !node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const vr = obj.videoRenderer as
      | {
          videoId?: string;
          title?: { runs?: { text: string }[] };
          ownerText?: { runs?: { text: string }[] };
        }
      | undefined;
    if (vr?.videoId) {
      found.push({
        id: vr.videoId,
        title: vr.title?.runs?.[0]?.text ?? "Video",
        channel: vr.ownerText?.runs?.[0]?.text ?? "",
        thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
      });
      return;
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(JSON.parse(match[1]));
  return found;
}
