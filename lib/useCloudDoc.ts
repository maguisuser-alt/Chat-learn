"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncState } from "@/lib/syncMerge";

interface Options<T> {
  /** Ruta en /api/sync (settings, decks, profile). */
  kind: string;
  /** Sincronizar (solo con cuenta de Google). */
  enabled: boolean;
  /** Clave de almacenamiento local ya cargada (o null mientras carga): evita mezclar cuentas. */
  loadedKey: string | null;
  value: T;
  /** Aplica la versión fusionada con la del servidor. */
  apply: (merge: (local: T) => T) => void;
  merge: (local: T, remote: T) => T;
}

/**
 * Sincroniza un documento con MongoDB: al cargar (y al volver a la pestaña) baja
 * la copia del servidor y la fusiona con la local; luego sube los cambios con
 * una pequeña espera para agrupar varios seguidos.
 */
export function useCloudDoc<T>({ kind, enabled, loadedKey, value, apply, merge }: Options<T>): SyncState {
  const [status, setStatus] = useState<SyncState>("off");
  const [pulledKey, setPulledKey] = useState<string | null>(null);
  const [pullTick, setPullTick] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const mergeRef = useRef(merge);
  mergeRef.current = merge;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const dirty = useRef(false);

  // Bajar y fusionar.
  useEffect(() => {
    if (!enabled || !loadedKey) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setStatus("syncing");
    fetch(`/api/sync/${kind}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const { data } = (await r.json()) as { data: T | null };
        if (cancelled) return;
        if (data) applyRef.current((local) => mergeRef.current(local, data));
        dirty.current = true; // sube la versión fusionada (o la local si el servidor no tenía nada)
        setPulledKey(loadedKey);
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        retry = setTimeout(() => setPullTick((n) => n + 1), 30_000);
      });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [kind, enabled, loadedKey, pullTick]);

  // Al volver a la pestaña se buscan cambios hechos en otros dispositivos.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => document.visibilityState === "visible" && setPullTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  // Cualquier cambio local tras la primera bajada queda pendiente de subir.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
  }, [value]);

  // Subir (agrupando cambios).
  const ready = enabled && !!loadedKey && pulledKey === loadedKey;
  useEffect(() => {
    if (!ready || !dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      setStatus("syncing");
      fetch(`/api/sync/${kind}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: valueRef.current }),
      })
        .then((r) => {
          if (!r.ok) dirty.current = true;
          setStatus(r.ok ? "ok" : "error");
        })
        .catch(() => {
          dirty.current = true;
          setStatus("error");
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [value, ready, kind]);

  // Al ocultar la pestaña se sube lo pendiente (keepalive admite hasta 64 KB).
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (document.visibilityState !== "hidden" || !dirty.current) return;
      const body = JSON.stringify({ data: valueRef.current });
      if (body.length > 60_000) return;
      dirty.current = false;
      fetch(`/api/sync/${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {
        dirty.current = true;
      });
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [ready, kind]);

  return status;
}
