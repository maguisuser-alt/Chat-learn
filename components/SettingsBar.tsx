"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle, ShieldCheck } from "lucide-react";
import { LEVELS } from "@/lib/schemas";
import { LANGUAGES, type Profile } from "@/lib/languages";

interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  keyEnv: string;
}
interface Check {
  id: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  /** Muestra los selectores de idioma y nivel (solo en la sección Idiomas). */
  showLanguage?: boolean;
}

export default function SettingsBar({ profile, onChange, showLanguage = true }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);

  async function validate() {
    setValidating(true);
    try {
      const res = await fetch("/api/providers", { method: "POST" });
      const list = (await res.json()) as Check[];
      setChecks(Object.fromEntries(list.map((c) => [c.id, c])));
    } finally {
      setValidating(false);
    }
  }

  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const field = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {showLanguage && (
        <>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Idioma</span>
          <select
            className={field}
            value={profile.language}
            onChange={(e) => set({ language: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.name}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Nivel</span>
          <select
            className={field}
            value={profile.level}
            onChange={(e) => set({ level: e.target.value })}
          >
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        </>
        )}
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">IA</span>
          <select
            className={field}
            value={profile.provider}
            onChange={(e) => set({ provider: e.target.value })}
          >
            <option value="auto">Automática (con respaldo)</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.label}
                {p.configured ? "" : " (sin clave)"}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={validate}
          disabled={validating}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-60"
        >
          {validating ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Validar IAs
        </button>
      </div>

      {providers.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {providers.map((p) => {
            const c = checks[p.id];
            return (
              <li
                key={p.id}
                title={c?.error ?? (p.configured ? p.model : `Define ${p.keyEnv} en .env.local`)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1"
              >
                {c ? (
                  c.ok ? (
                    <CheckCircle2 className="size-3.5 text-green-600" />
                  ) : (
                    <XCircle className="size-3.5 text-red-600" />
                  )
                ) : (
                  <span
                    className={`size-2 rounded-full ${p.configured ? "bg-green-500" : "bg-slate-300"}`}
                  />
                )}
                {p.label} · {p.model}
                {c?.ok && c.latencyMs ? ` · ${c.latencyMs} ms` : ""}
                {c && !c.ok ? ` · ${c.error?.slice(0, 60)}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
