"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, SwitchCamera, X } from "lucide-react";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

const MAX_SIDE = 2048;

/** Toma una foto con la cámara del dispositivo (para adjuntarla al chat). */
export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("La cámara solo funciona en https o en localhost, y con un navegador compatible.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "Permite el acceso a la cámara en el navegador (icono junto a la dirección)."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No se encontró una cámara disponible."
              : name === "NotReadableError"
                ? "La cámara está siendo usada por otra aplicación."
                : "No se pudo abrir la cámara."
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    // La cámara frontal se ve como un espejo; la foto se guarda igual que en pantalla.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.9));
  }

  return (
    <div className="theme-fixed fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal aria-label="Cámara">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar cámara">
          <X className="size-6" />
        </button>
        <span className="font-semibold">Tomar foto</span>
        <button
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Cambiar de cámara"
          title="Cambiar de cámara"
        >
          <SwitchCamera className="size-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`max-h-full max-w-full ${facing === "user" ? "-scale-x-100" : ""} ${ready ? "" : "invisible"}`}
        />
        {!ready && !error && <Loader2 className="absolute size-8 animate-spin text-white/60" />}
        {error && <p className="absolute max-w-sm px-6 text-center text-amber-200">{error}</p>}
      </div>

      <div className="flex justify-center p-6">
        <button
          onClick={capture}
          disabled={!ready}
          className="flex size-18 items-center justify-center rounded-full border-4 border-white bg-white/20 p-4 disabled:opacity-40"
          aria-label="Capturar foto"
        >
          <Camera className="size-8" />
        </button>
      </div>
    </div>
  );
}
