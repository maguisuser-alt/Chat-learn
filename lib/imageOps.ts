/** Ajustes de color del editor. Todos van de -100 a 100 (0 = sin cambio). */
export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Positivo = más cálido (rojizo), negativo = más frío (azulado). */
  warmth: number;
  filter: FilterId;
}

export const FILTERS = [
  { id: "none", label: "Original" },
  { id: "bw", label: "Blanco y negro" },
  { id: "sepia", label: "Sepia" },
  { id: "vintage", label: "Vintage" },
  { id: "invert", label: "Invertir" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export const DEFAULT_ADJ: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, filter: "none" };

export function isDefault(a: Adjustments) {
  return a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.warmth === 0 && a.filter === "none";
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Aplica filtro y ajustes sobre los píxeles RGBA (en el sitio). Se hace a mano en
 * vez de con `ctx.filter` para que funcione igual en todos los navegadores.
 */
export function applyAdjustments(data: Uint8ClampedArray, a: Adjustments) {
  if (isDefault(a)) return;
  const b = a.brightness * 2.55;
  const c = a.contrast * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const sat = 1 + a.saturation / 100;
  const w = a.warmth * 0.6;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];

    switch (a.filter) {
      case "bw": {
        const y = 0.299 * r + 0.587 * g + 0.114 * bl;
        r = g = bl = y;
        break;
      }
      case "sepia":
      case "vintage": {
        const sr = 0.393 * r + 0.769 * g + 0.189 * bl;
        const sg = 0.349 * r + 0.686 * g + 0.168 * bl;
        const sb = 0.272 * r + 0.534 * g + 0.131 * bl;
        const k = a.filter === "vintage" ? 0.55 : 1; // vintage: sepia suave y algo lavado
        r = r + (sr - r) * k;
        g = g + (sg - g) * k;
        bl = bl + (sb - bl) * k;
        if (a.filter === "vintage") {
          r = r * 0.9 + 20;
          g = g * 0.9 + 15;
          bl = bl * 0.9 + 10;
        }
        break;
      }
      case "invert":
        r = 255 - r;
        g = 255 - g;
        bl = 255 - bl;
        break;
    }

    if (sat !== 1) {
      const y = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = y + (r - y) * sat;
      g = y + (g - y) * sat;
      bl = y + (bl - y) * sat;
    }
    if (c !== 0) {
      r = cf * (r - 128) + 128;
      g = cf * (g - 128) + 128;
      bl = cf * (bl - 128) + 128;
    }
    if (b !== 0) {
      r += b;
      g += b;
      bl += b;
    }
    if (w !== 0) {
      r += w;
      bl -= w;
    }
    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(bl);
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectángulo de recorte centrado y lo más grande posible con la proporción dada (null = libre/completo). */
export function centeredCrop(width: number, height: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: width, h: height };
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** Mantiene el rectángulo dentro de la imagen y con un tamaño mínimo. */
export function clampRect(r: Rect, width: number, height: number, min = 16): Rect {
  const w = Math.min(Math.max(r.w, min), width);
  const h = Math.min(Math.max(r.h, min), height);
  return {
    x: Math.min(Math.max(r.x, 0), width - w),
    y: Math.min(Math.max(r.y, 0), height - h),
    w,
    h,
  };
}
