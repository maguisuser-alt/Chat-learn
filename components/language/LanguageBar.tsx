"use client";

import { Languages } from "lucide-react";
import { LEVELS } from "@/lib/schemas";
import { LANGUAGES, type Profile } from "@/lib/languages";

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
}

/** Idioma y nivel en la barra superior de las secciones de idiomas. */
export default function LanguageBar({ profile, onChange }: Props) {
  const select =
    "cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-2 pr-1 text-sm font-medium outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-brand-600";
  return (
    <div className="ml-auto flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5" role="group" aria-label="Idioma y nivel">
      <Languages className="size-4 shrink-0 text-slate-500" aria-hidden />
      <select
        value={profile.language}
        onChange={(e) => onChange({ ...profile, language: e.target.value })}
        className={select}
        aria-label="Idioma que estudias"
        title="Idioma que estudias"
      >
        {LANGUAGES.map((l) => (
          <option key={l.name}>{l.name}</option>
        ))}
      </select>
      <span className="text-slate-300" aria-hidden>
        ·
      </span>
      <select
        value={profile.level}
        onChange={(e) => onChange({ ...profile, level: e.target.value })}
        className={select}
        aria-label="Nivel (MCER)"
        title="Nivel (MCER)"
      >
        {LEVELS.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
    </div>
  );
}
