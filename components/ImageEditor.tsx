"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brush,
  Check,
  Crop,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  applyAdjustments,
  centeredCrop,
  clampRect,
  DEFAULT_ADJ,
  FILTERS,
  isDefault,
  type Adjustments,
  type Rect,
} from "@/lib/imageOps";

type Tool = "adjust" | "crop" | "draw" | "text" | "ai";

interface Props {
  src: string;
  onClose: () => void;
  /** Recibe la imagen editada (data URL JPEG) para adjuntarla al chat. */
  onUse: (dataUrl: string) => void;
}

/** Lado máximo de trabajo: más grande sería lento y pesado de enviar. */
const MAX_SIDE = 2048;
const MAX_HISTORY = 15;

const TOOLS: { id: Tool; label: string; Icon: typeof Crop }[] = [
  { id: "adjust", label: "Ajustes", Icon: SlidersHorizontal },
  { id: "crop", label: "Recortar", Icon: Crop },
  { id: "draw", label: "Dibujar", Icon: Brush },
  { id: "text", label: "Texto", Icon: Type },
  { id: "ai", label: "Editar con IA", Icon: Sparkles },
];

const RATIOS: { label: string; value: number | null }[] = [
  { label: "Libre", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

const SLIDERS: { key: keyof Omit<Adjustments, "filter">; label: string }[] = [
  { key: "brightness", label: "Brillo" },
  { key: "contrast", label: "Contraste" },
  { key: "saturation", label: "Saturación" },
  { key: "warmth", label: "Calidez" },
];

const COLORS = ["#ffffff", "#000000", "#ef4444", "#f59e0b", "#10a37f", "#3b82f6", "#a855f7"];

function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo abrir la imagen"));
    img.src = src;
  });
}

/** Exporta un lienzo como JPEG con fondo blanco (el JPEG no admite transparencia). */
function toJpeg(canvas: HTMLCanvasElement, maxSide = Infinity, quality = 0.92) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const out = newCanvas(canvas.width * scale, canvas.height * scale);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}

export default function ImageEditor({ src, onClose, onUse }: Props) {
  /** Imagen base: rotar, recortar, dibujar y texto la modifican. */
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  /** Lienzo visible: la base con los ajustes de color aplicados. */
  const viewRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const drawingRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; rect: Rect } | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("adjust");
  const [adj, setAdj] = useState<Adjustments>(DEFAULT_ADJ);
  const [history, setHistory] = useState<string[]>([]);

  const [ratio, setRatio] = useState<number | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);

  const [color, setColor] = useState("#ef4444");
  const [brush, setBrush] = useState(8);
  const [text, setText] = useState("Texto");
  const [fontSize, setFontSize] = useState(48);

  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  /** Pinta la base (con los ajustes) en el lienzo visible. */
  const render = useCallback((a: Adjustments) => {
    const base = baseRef.current;
    const view = viewRef.current;
    if (!base || !view) return;
    if (view.width !== base.width || view.height !== base.height) {
      view.width = base.width;
      view.height = base.height;
    }
    const ctx = view.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(base, 0, 0);
    if (!isDefault(a)) {
      const data = ctx.getImageData(0, 0, view.width, view.height);
      applyAdjustments(data.data, a);
      ctx.putImageData(data, 0, 0);
    }
  }, []);

  /** Sustituye la base por un lienzo nuevo y refresca. */
  const setBase = useCallback(
    (c: HTMLCanvasElement) => {
      baseRef.current = c;
      setSize({ w: c.width, h: c.height });
      render(DEFAULT_ADJ);
    },
    [render]
  );

  // Carga inicial, reducida si es muy grande.
  useEffect(() => {
    let cancelled = false;
    loadImage(src)
      .then((img) => {
        if (cancelled) return;
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = newCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        setBase(c);
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [src, setBase]);

  // Los ajustes se previsualizan en vivo (agrupados por fotograma).
  useEffect(() => {
    if (!ready) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => render(adj));
  }, [adj, ready, render]);

  // Escape cierra el editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Guarda el estado actual para poder deshacer. */
  function snapshot() {
    const base = baseRef.current;
    if (!base) return;
    const url = base.toDataURL("image/png");
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), url]);
  }

  /** Incorpora los ajustes de color a la base (antes de cualquier cambio que la modifique). */
  function bake() {
    const view = viewRef.current;
    if (!view || isDefault(adj)) return;
    const c = newCanvas(view.width, view.height);
    c.getContext("2d")!.drawImage(view, 0, 0);
    baseRef.current = c;
    setAdj(DEFAULT_ADJ);
  }

  /** Aplica una transformación que devuelve una base nueva. */
  function transform(fn: (base: HTMLCanvasElement) => HTMLCanvasElement) {
    if (!baseRef.current) return;
    // Primero se fijan los ajustes: así deshacer vuelve a la imagen ajustada, sin perderlos.
    bake();
    snapshot();
    setBase(fn(baseRef.current!));
  }

  async function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    const img = await loadImage(prev);
    const c = newCanvas(img.width, img.height);
    c.getContext("2d")!.drawImage(img, 0, 0);
    setAdj(DEFAULT_ADJ);
    setCrop(null);
    setBase(c);
  }

  function rotate(dir: 1 | -1) {
    transform((b) => {
      const c = newCanvas(b.height, b.width);
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((dir * Math.PI) / 2);
      ctx.drawImage(b, -b.width / 2, -b.height / 2);
      return c;
    });
    setCrop(null);
  }

  function flip(horizontal: boolean) {
    transform((b) => {
      const c = newCanvas(b.width, b.height);
      const ctx = c.getContext("2d")!;
      ctx.translate(horizontal ? c.width : 0, horizontal ? 0 : c.height);
      ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      ctx.drawImage(b, 0, 0);
      return c;
    });
    setCrop(null);
  }

  function chooseTool(t: Tool) {
    setTool(t);
    if (t === "crop") setCrop(centeredCrop(size.w, size.h, ratio));
    else setCrop(null);
  }

  function chooseRatio(r: number | null) {
    setRatio(r);
    setCrop(centeredCrop(size.w, size.h, r));
  }

  function applyCrop() {
    if (!crop) return;
    const r = clampRect(crop, size.w, size.h);
    transform((b) => {
      const c = newCanvas(r.w, r.h);
      c.getContext("2d")!.drawImage(b, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      return c;
    });
    setCrop(null);
    setTool("adjust");
  }

  /** Convierte la posición del puntero a coordenadas de la imagen. */
  function toImage(e: React.PointerEvent) {
    const rect = viewRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * size.w,
      y: ((e.clientY - rect.top) / rect.height) * size.h,
      /** Píxeles de imagen por píxel de pantalla (para que el pincel tenga el tamaño que se ve). */
      scale: size.w / rect.width,
    };
  }

  // --- Dibujo y texto sobre la imagen ---
  function onCanvasDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool !== "draw" && tool !== "text") return;
    e.preventDefault();
    const p = toImage(e);
    bake();
    snapshot();
    const ctx = baseRef.current!.getContext("2d")!;
    if (tool === "text") {
      if (!text.trim()) return;
      const px = fontSize * p.scale;
      ctx.font = `bold ${px}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Contorno para que se lea sobre cualquier fondo.
      ctx.lineWidth = Math.max(2, px / 8);
      ctx.strokeStyle = color === "#000000" ? "#ffffff" : "#000000";
      ctx.lineJoin = "round";
      ctx.strokeText(text, p.x, p.y);
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, p.y);
      render(DEFAULT_ADJ);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { x: p.x, y: p.y };
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (brush * p.scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    render(DEFAULT_ADJ);
  }

  function onCanvasMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const last = drawingRef.current;
    if (tool !== "draw" || !last) return;
    const p = toImage(e);
    const ctx = baseRef.current!.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.lineWidth = brush * p.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawingRef.current = { x: p.x, y: p.y };
    render(DEFAULT_ADJ);
  }

  function onCanvasUp() {
    drawingRef.current = null;
  }

  // --- Recorte: arrastrar para mover, esquina para redimensionar ---
  function onCropDown(e: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize") {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    dragRef.current = { mode, startX: p.x, startY: p.y, rect: crop };
  }

  function onCropMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const p = toImage(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    if (d.mode === "move") {
      setCrop(clampRect({ ...d.rect, x: d.rect.x + dx, y: d.rect.y + dy }, size.w, size.h));
    } else {
      let w = Math.min(d.rect.w + dx, size.w - d.rect.x);
      let h = ratio ? w / ratio : Math.min(d.rect.h + dy, size.h - d.rect.y);
      if (ratio && d.rect.y + h > size.h) {
        h = size.h - d.rect.y;
        w = h * ratio;
      }
      setCrop(clampRect({ ...d.rect, w, h }, size.w, size.h));
    }
  }

  // --- Edición con IA ---
  async function runAi() {
    const base = baseRef.current;
    if (!base || !instruction.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      bake();
      const res = await fetch("/api/image-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: toJpeg(baseRef.current!, 1536, 0.9), instruction: instruction.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo editar la imagen");
      const img = await loadImage(json.url);
      snapshot();
      const c = newCanvas(img.width, img.height);
      c.getContext("2d")!.drawImage(img, 0, 0);
      setBase(c);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "No se pudo editar la imagen");
    } finally {
      setAiBusy(false);
    }
  }

  function download() {
    const view = viewRef.current;
    if (!view) return;
    const a = document.createElement("a");
    a.href = view.toDataURL("image/png");
    a.download = "lingua-imagen-editada.png";
    a.click();
  }

  function sendToChat() {
    const view = viewRef.current;
    if (view) onUse(toJpeg(view));
  }

  const cursor = tool === "draw" ? "cursor-crosshair" : tool === "text" ? "cursor-text" : "";
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="theme-fixed fixed inset-0 z-50 flex flex-col bg-[#111] text-white" role="dialog" aria-modal aria-label="Editor de imagen">
      {/* Barra superior */}
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar editor">
          <X className="size-5" />
        </button>
        <h2 className="font-semibold">Editar imagen</h2>
        {ready && <span className="text-xs text-white/50">{size.w}×{size.h}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!history.length} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Deshacer" title="Deshacer">
            <Undo2 className="size-5" />
          </button>
          <button onClick={() => rotate(-1)} disabled={!ready} className="rounded-full p-2 hover:bg-white/10" aria-label="Girar a la izquierda" title="Girar a la izquierda">
            <RotateCcw className="size-5" />
          </button>
          <button onClick={() => rotate(1)} disabled={!ready} className="rounded-full p-2 hover:bg-white/10" aria-label="Girar a la derecha" title="Girar a la derecha">
            <RotateCw className="size-5" />
          </button>
          <button onClick={() => flip(true)} disabled={!ready} className="rounded-full p-2 hover:bg-white/10" aria-label="Voltear horizontal" title="Voltear horizontal">
            <FlipHorizontal2 className="size-5" />
          </button>
          <button onClick={() => flip(false)} disabled={!ready} className="rounded-full p-2 hover:bg-white/10" aria-label="Voltear vertical" title="Voltear vertical">
            <FlipVertical2 className="size-5" />
          </button>
          <button onClick={download} disabled={!ready} className="ml-2 flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">
            <Download className="size-4" /> Descargar
          </button>
          <button onClick={sendToChat} disabled={!ready} className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold hover:bg-brand-700">
            <Check className="size-4" /> Usar en el chat
          </button>
        </div>
      </header>

      {/* Imagen */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {error && <p className="text-rose-300">{error}</p>}
        {!ready && !error && <Loader2 className="size-8 animate-spin text-white/60" />}
        <div className={`relative ${ready ? "" : "hidden"}`}>
          <canvas
            ref={viewRef}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onPointerCancel={onCanvasUp}
            className={`block max-h-[calc(100dvh-260px)] max-w-full touch-none ${cursor}`}
          />
          {crop && (
            <div
              className="absolute inset-0 overflow-hidden"
              onPointerMove={onCropMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
            >
              {/* Zona oscurecida fuera del recorte */}
              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{ left: pct(crop.x, size.w), top: pct(crop.y, size.h), width: pct(crop.w, size.w), height: pct(crop.h, size.h) }}
                onPointerDown={(e) => onCropDown(e, "move")}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="border border-white/20" />
                  ))}
                </div>
                <div
                  className="absolute -bottom-2 -right-2 size-5 cursor-nwse-resize rounded-full border-2 border-white bg-brand-600"
                  onPointerDown={(e) => onCropDown(e, "resize")}
                  aria-label="Redimensionar recorte"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Herramientas */}
      <footer className="border-t border-white/10 bg-[#1a1a1a] px-3 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="min-h-[92px] py-2">
            {tool === "adjust" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setAdj((a) => ({ ...a, filter: f.id }))}
                      className={`rounded-full px-3 py-1 text-sm ${adj.filter === f.id ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
                    >
                      {f.label}
                    </button>
                  ))}
                  {!isDefault(adj) && (
                    <button onClick={() => setAdj(DEFAULT_ADJ)} className="ml-auto text-sm text-white/60 hover:text-white">
                      Restablecer
                    </button>
                  )}
                </div>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {SLIDERS.map((s) => (
                    <label key={s.key} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 text-white/70">{s.label}</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={adj[s.key]}
                        onChange={(e) => setAdj((a) => ({ ...a, [s.key]: Number(e.target.value) }))}
                        className="flex-1 accent-[#10a37f]"
                      />
                      <span className="w-8 text-right tabular-nums text-white/60">{adj[s.key]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tool === "crop" && (
              <div className="flex flex-wrap items-center gap-2">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => chooseRatio(r.value)}
                    className={`rounded-full px-3 py-1 text-sm ${ratio === r.value ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
                  >
                    {r.label}
                  </button>
                ))}
                <span className="text-xs text-white/50">Arrastra el recuadro o su esquina.</span>
                <button onClick={applyCrop} className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold">
                  <Check className="size-4" /> Aplicar recorte
                </button>
              </div>
            )}

            {(tool === "draw" || tool === "text") && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`size-7 rounded-full border-2 ${color === c ? "border-brand-600 ring-2 ring-white" : "border-white/30"}`}
                      style={{ background: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
                {tool === "draw" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-white/70">Grosor</span>
                    <input type="range" min={2} max={40} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="accent-[#10a37f]" />
                  </label>
                ) : (
                  <>
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={80}
                      placeholder="Escribe el texto"
                      className="min-w-[160px] flex-1 rounded-full bg-white/10 px-3 py-1.5 text-sm outline-none"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-white/70">Tamaño</span>
                      <input type="range" min={14} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="accent-[#10a37f]" />
                    </label>
                  </>
                )}
                <span className="text-xs text-white/50">
                  {tool === "draw" ? "Dibuja sobre la imagen." : "Haz clic en la imagen donde quieras el texto."}
                </span>
              </div>
            )}

            {tool === "ai" && (
              <div className="space-y-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runAi();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    maxLength={500}
                    placeholder="Describe el cambio, p. ej.: cambia el fondo por una playa"
                    className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy || instruction.trim().length < 2}
                    className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {aiBusy ? "Editando…" : "Aplicar"}
                  </button>
                </form>
                {aiError ? (
                  <p className="text-sm text-amber-300">{aiError}</p>
                ) : (
                  <p className="text-xs text-white/50">
                    Usa los modelos de imagen de Gemini. La imagen se envía a Google para editarla.
                  </p>
                )}
              </div>
            )}
          </div>

          <nav className="flex justify-center gap-1 border-t border-white/10 pt-2">
            {TOOLS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => chooseTool(id)}
                disabled={!ready}
                className={`flex min-w-[72px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs ${
                  tool === id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
