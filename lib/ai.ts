import { google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { currentOwner, logInteraction, type InteractionEntry } from "@/lib/log";

export type ProviderId = "google" | "groq" | "openrouter" | "zhipu" | "siliconflow" | "openai";

/** Endpoint de Zhipu: bigmodel.cn (China, donde CogView-3-Flash es gratis) o api.z.ai (internacional). */
export const zhipuBaseUrl = () => (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");

/**
 * GLM-4.7-Flash «piensa» antes de responder y con pocos tokens devuelve el texto
 * vacío: se desactiva el modo de pensamiento (respuestas en 1-2 s). Con
 * ZHIPU_THINKING=on se deja activado.
 */
const zhipuFetch: typeof fetch = (input, init) => {
  if (process.env.ZHIPU_THINKING !== "on" && typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      if (body && typeof body === "object" && Array.isArray(body.messages)) {
        if (!body.thinking) body.thinking = { type: "disabled" };
        // GLM no admite response_format «json_schema»: se pide JSON simple y el esquema va como instrucción.
        const rf = body.response_format;
        if (rf?.type === "json_schema") {
          const schema = rf.json_schema?.schema;
          body.response_format = { type: "json_object" };
          body.messages = [
            {
              role: "system",
              content: `Responde SOLO con un objeto JSON válido (sin texto ni bloques de código) que cumpla este JSON Schema:\n${JSON.stringify(schema)}`,
            },
            ...body.messages,
          ];
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      /* cuerpo no JSON: se envía tal cual */
    }
  }
  return fetch(input, init);
};

interface ProviderDef {
  id: ProviderId;
  label: string;
  description: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  /** Crea el modelo para esta API. */
  create: (model: string, apiKey: string) => LanguageModel;
}

/**
 * Registro de proveedores. Groq y OpenRouter usan el endpoint compatible con
 * OpenAI (`.chat`), por lo que añadir otro proveedor es añadir una entrada.
 */
const PROVIDERS: ProviderDef[] = [
  {
    id: "google",
    label: "Google Gemini",
    description: "Contexto enorme (guías PDF completas) y nivel gratuito generoso.",
    keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    defaultModel: "gemini-flash-lite-latest",
    create: (model) => google(model),
  },
  {
    id: "groq",
    label: "Groq",
    description: "La más rápida (Llama 3 sobre hardware LPU).",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    create: (model, apiKey) =>
      createOpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey }).chat(model),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Agregador con modelos gratuitos (:free) intercambiables.",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    create: (model, apiKey) =>
      createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey }).chat(model),
  },
  {
    id: "zhipu",
    label: "Zhipu GLM (China)",
    description: "GLM-4.7-Flash gratis y sin límite de tokens; buen español y razonamiento.",
    keyEnv: "ZHIPU_API_KEY",
    modelEnv: "ZHIPU_MODEL",
    defaultModel: "glm-4.7-flash",
    create: (model, apiKey) => createOpenAI({ baseURL: zhipuBaseUrl(), apiKey, fetch: zhipuFetch }).chat(model),
  },
  {
    id: "siliconflow",
    label: "SiliconFlow (China)",
    description: "Qwen, DeepSeek, GLM y Kimi con una sola clave; modelos ligeros gratis.",
    keyEnv: "SILICONFLOW_API_KEY",
    modelEnv: "SILICONFLOW_MODEL",
    defaultModel: "Qwen/Qwen3-8B",
    create: (model, apiKey) =>
      createOpenAI({ baseURL: process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.com/v1", apiKey }).chat(model),
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Opcional, de pago.",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    create: (model) => openai(model),
  },
];

export const AUTO = "auto";

/** Modelos del proveedor, en orden. La variable admite varios separados por comas. */
function modelsFor(def: ProviderDef): string[] {
  const legacy = (process.env.AI_PROVIDER ?? "google") === def.id ? process.env.AI_MODEL : undefined;
  const raw = process.env[def.modelEnv] || legacy || def.defaultModel;
  const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : [def.defaultModel];
}

function modelNameFor(def: ProviderDef) {
  return modelsFor(def)[0];
}

function isConfigured(def: ProviderDef) {
  return Boolean(process.env[def.keyEnv]);
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  description: string;
  model: string;
  configured: boolean;
  keyEnv: string;
}

export function listProviders(): ProviderInfo[] {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    model: modelNameFor(p),
    configured: isConfigured(p),
    keyEnv: p.keyEnv,
  }));
}

/** Proveedores con API key, con el preferido (AI_PROVIDER) primero. */
function configuredOrder(): ProviderDef[] {
  const preferred = process.env.AI_PROVIDER;
  return PROVIDERS.filter(isConfigured).sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred)
  );
}

/**
 * Devuelve el modelo del proveedor pedido. Con "auto" (o un proveedor sin
 * clave) usa el primero configurado.
 */
export function getModel(requested?: string): LanguageModel {
  return resolveModel(requested).model;
}

/** Como getModel, pero indica también qué proveedor se eligió. */
export function resolveModel(requested?: string): { model: LanguageModel; provider: ProviderId } {
  const chain = providerChain(requested);
  const def = chain[0];
  if (!def) {
    throw new Error(
      "No hay ningún proveedor de IA configurado. Define GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY u OPENROUTER_API_KEY en .env.local"
    );
  }
  return { model: def.create(modelNameFor(def), process.env[def.keyEnv]!), provider: def.id };
}

export interface ModelCandidate {
  model: LanguageModel;
  provider: ProviderId;
  name: string;
}

/** Todos los modelos configurados en orden de intento (proveedor pedido primero). */
export function candidateModels(requested?: string): ModelCandidate[] {
  return providerChain(requested).flatMap((def) =>
    modelsFor(def).map((name) => ({
      model: def.create(name, process.env[def.keyEnv]!),
      provider: def.id,
      name,
    }))
  );
}

/** Traduce los errores habituales de las APIs a un mensaje claro en español. */
export function friendlyAIError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/速率限制|\b1302\b|请求频率|并发/.test(msg)) {
    return "El proveedor de IA recibió demasiadas peticiones seguidas. Espera unos segundos e inténtalo de nuevo.";
  }
  if (/sin respuesta en/i.test(msg)) {
    return "La IA tardó demasiado en responder. Inténtalo de nuevo.";
  }
  if (/quota|RESOURCE_EXHAUSTED|429|rate.?limit/i.test(msg)) {
    return "Se agotó la cuota gratuita del proveedor de IA. Espera un minuto o añade otra API key gratuita (Zhipu GLM, Groq u OpenRouter) en .env.local.";
  }
  if (/high demand|overloaded|503|UNAVAILABLE|访问量过大|稍后再试/i.test(msg)) {
    return "El modelo de IA está saturado en este momento. Inténtalo de nuevo en unos segundos.";
  }
  if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) {
    return "La API key del proveedor de IA no es válida o no tiene permisos.";
  }
  if (/aborted|timeout/i.test(msg)) {
    return "La IA tardó demasiado en responder. Inténtalo de nuevo.";
  }
  return msg.slice(0, 300);
}

/** Orden de intentos: el pedido primero (si está configurado) y luego el resto. */
function providerChain(requested?: string): ProviderDef[] {
  const all = configuredOrder();
  const first = all.find((p) => p.id === requested);
  return first ? [first, ...all.filter((p) => p !== first)] : all;
}

// Modelos saturados: se saltan un rato para no perder tiempo en cada petición y
// pasar directamente al siguiente. Un 503 («high demand») tarda ~10 s en llegar;
// un modelo que no responde puede quedarse colgado minutos, así que se pausa más.
const OVERLOAD_MS = 2 * 60_000;
const HUNG_MS = 5 * 60_000;
const overload = globalThis as typeof globalThis & { _aiOverloaded?: Map<string, number> };
const overloaded = (overload._aiOverloaded ??= new Map<string, number>());

export function isOverloaded(provider: string, model: string) {
  return Date.now() < (overloaded.get(`${provider}/${model}`) ?? 0);
}

export function markIfOverloaded(provider: string, model: string, message: string) {
  const key = `${provider}/${model}`;
  if (/sin respuesta en|aborted due to timeout/i.test(message)) overloaded.set(key, Date.now() + HUNG_MS);
  else if (/high demand|overloaded|UNAVAILABLE|\b503\b|访问量过大/i.test(message)) overloaded.set(key, Date.now() + OVERLOAD_MS);
}

/**
 * Como runWithFallback, pero el primer proveedor y los demás compiten en paralelo
 * y gana la primera respuesta válida (la otra se cancela). Para tareas largas
 * (dibujar un SVG, planear una imagen): si Gemini está saturado, GLM ya va
 * avanzando en vez de esperar a que fallen todos los modelos de Gemini.
 */
export async function raceProviders<T>(
  fn: (model: LanguageModel, provider: ProviderId, signal: AbortSignal) => Promise<T>,
  kind: InteractionEntry["kind"],
  attemptTimeoutMs: number,
  /**
   * Ventaja del primer proveedor: los demás solo arrancan si este falla o tarda
   * más de esto. Así no se lanzan dos peticiones a la vez cuando no hace falta
   * (el nivel gratuito de Zhipu rechaza peticiones simultáneas con el error 1302).
   */
  headStartMs: number
): Promise<T> {
  const ids = configuredOrder().map((p) => p.id);
  if (ids.length < 2) return runWithFallback(undefined, fn, kind, attemptTimeoutMs);
  const stop = new AbortController();
  const first = runWithFallback(undefined, fn, kind, attemptTimeoutMs, [ids[0]], stop.signal);
  const rest = (async () => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, headStartMs);
      first.then(
        () => clearTimeout(timer),
        () => {
          clearTimeout(timer);
          resolve();
        }
      );
    });
    if (stop.signal.aborted) throw stop.signal.reason;
    return runWithFallback(undefined, fn, kind, attemptTimeoutMs, ids.slice(1), stop.signal);
  })();
  try {
    return await Promise.any([first, rest]);
  } catch (err) {
    throw err instanceof AggregateError ? err.errors[0] : err;
  } finally {
    stop.abort(new Error("otro proveedor respondió antes"));
  }
}

/**
 * Ejecuta `fn` con el proveedor pedido y, si falla (cuota, red, modelo), prueba
 * automáticamente con los demás proveedores configurados.
 */
export async function runWithFallback<T>(
  requested: string | undefined,
  fn: (model: LanguageModel, provider: ProviderId, signal: AbortSignal) => Promise<T>,
  /** Tipo de consulta, para el registro de uso. */
  kind: InteractionEntry["kind"] = "other",
  attemptTimeoutMs = 25_000,
  /** Limita los intentos a estos proveedores (p. ej. solo Gemini para audio). */
  only?: ProviderId[],
  /** Corta los intentos (p. ej. porque otro proveedor ya respondió en raceProviders). */
  stop?: AbortSignal
): Promise<T> {
  const chain = providerChain(requested).filter((p) => !only || only.includes(p.id));
  if (chain.length === 0) {
    if (only) throw new Error(`Esta función necesita ${only.map((id) => PROVIDERS.find((p) => p.id === id)?.label ?? id).join(" o ")}.`);
    getModel(requested); // lanza el error descriptivo
  }
  // Se resuelve ya (dentro de la petición) para poder registrar después sin bloquear.
  const owner = currentOwner();
  const t0 = Date.now();
  let attempts = 0;
  let lastError: unknown;
  let lastTried = { provider: "", model: "" };
  // Si todos los modelos están en pausa por saturación, se prueban igualmente.
  const allCooling = chain.every((def) => modelsFor(def).every((name) => isOverloaded(def.id, name)));
  for (const def of chain) {
    const names = modelsFor(def);
    let retried = false;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (stop?.aborted) throw stop.reason;
      if (!allCooling && isOverloaded(def.id, name)) continue;
      attempts++;
      lastTried = { provider: def.id, model: name };
      // El límite se aplica con un temporizador propio: la señal de cancelación sola
      // no siempre corta la petición a tiempo y un modelo colgado retrasaba minutos.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onStop: (() => void) | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error(`sin respuesta en ${Math.round(attemptTimeoutMs / 1000)} s`);
          controller.abort(e);
          reject(e);
        }, attemptTimeoutMs);
        if (stop) {
          onStop = () => {
            controller.abort(stop.reason);
            reject(stop.reason);
          };
          stop.addEventListener("abort", onStop, { once: true });
        }
      });
      try {
        const result = await Promise.race([fn(def.create(name, process.env[def.keyEnv]!), def.id, controller.signal), deadline]);
        logInteraction({ owner, kind, ...lastTried, ok: true, latencyMs: Date.now() - t0, attempts });
        return result;
      } catch (err) {
        // Cancelado porque otro proveedor ya respondió: no es un fallo del modelo.
        if (stop?.aborted) throw stop.reason;
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        // Límite de frecuencia (Zhipu 1302): se espera un poco y se reintenta una vez el mismo modelo.
        if (!retried && /速率限制|\b1302\b|请求频率/.test(msg)) {
          retried = true;
          console.warn(`[ai] ${def.id}/${name}: límite de frecuencia, reintento en 3 s`);
          await new Promise((r) => setTimeout(r, 3_000));
          i--;
          continue;
        }
        markIfOverloaded(def.id, name, msg);
        console.warn(`[ai] ${def.id}/${name} falló, probando el siguiente: ${msg.slice(0, 160)}`);
      } finally {
        clearTimeout(timer);
        if (onStop) stop?.removeEventListener("abort", onStop);
      }
    }
  }
  logInteraction({
    owner,
    kind,
    ...lastTried,
    ok: false,
    latencyMs: Date.now() - t0,
    attempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}

/** Comprueba cada proveedor configurado con una petición mínima. */
export async function validateProviders() {
  const { generateText } = await import("ai");
  return Promise.all(
    PROVIDERS.map(async (def) => {
      const base = {
        id: def.id,
        label: def.label,
        model: modelNameFor(def),
        configured: isConfigured(def),
      };
      if (!base.configured) return { ...base, ok: false, error: `Falta ${def.keyEnv}` };
      const t0 = Date.now();
      try {
        await generateText({
          model: def.create(base.model, process.env[def.keyEnv]!),
          prompt: "Responde solo con la palabra OK.",
          maxOutputTokens: 16,
          abortSignal: AbortSignal.timeout(15_000),
        });
        return { ...base, ok: true, latencyMs: Date.now() - t0 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ...base, ok: false, latencyMs: Date.now() - t0, error: msg.slice(0, 200) };
      }
    })
  );
}
