/** Tipo de imagen pedida: decide cómo se genera. */
export const IMAGE_KINDS = ["logo", "icon", "photo", "illustration", "poster", "diagram"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export type Aspect = "square" | "landscape" | "portrait";

export const ASPECT_SIZE: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1344, height: 768 },
  portrait: { width: 768, height: 1344 },
};

/** Logos e iconos se dibujan como vector: el texto sale exacto y nítido. */
export const isVectorKind = (k: ImageKind) => k === "logo" || k === "icon";

const MAX_SVG = 60_000;

/**
 * Limpia un SVG generado por la IA: solo dibujo (sin scripts, eventos, enlaces
 * externos ni HTML incrustado). Devuelve null si no parece un SVG válido.
 */
export function sanitizeSvg(raw: string): string | null {
  let svg = raw.trim().replace(/^```(?:svg|xml)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = svg.search(/<svg[\s>]/i);
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  svg = svg.slice(start, end + 6);
  if (svg.length > MAX_SVG) return null;

  svg = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|foreignObject|iframe|object|embed|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|foreignObject|iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Solo referencias internas (#id); fuera URLs externas y javascript:.
    .replace(/\s+(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");

  if (!/viewBox\s*=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg viewBox="0 0 512 512"');
  if (!/xmlns\s*=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  // Tamaño explícito (con la proporción del viewBox): sin él algunos navegadores lo pintan a 0 px.
  if (!/<svg\b[^>]*\swidth\s*=/i.test(svg)) {
    const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    const w = vb ? Number(vb[1]) : 1;
    const h = vb ? Number(vb[2]) : 1;
    const scale = 1024 / Math.max(w, h, 1);
    svg = svg.replace(/<svg\b/i, `<svg width="${Math.round(w * scale) || 1024}" height="${Math.round(h * scale) || 1024}"`);
  }
  // Debe dibujar algo.
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|text|g)\b/i.test(svg)) return null;
  return svg;
}

/** Data URL de un SVG (base64 para que no haya problemas con caracteres especiales). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** Extensión de archivo para descargar una imagen según su tipo. */
export function imageExtension(mediaType: string): string {
  if (mediaType.includes("svg")) return "svg";
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  return "jpg";
}
