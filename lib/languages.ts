/** Idiomas de estudio soportados y su código BCP-47 para voz. */
export const LANGUAGES: { name: string; speech: string }[] = [
  { name: "Inglés", speech: "en-US" },
  { name: "Francés", speech: "fr-FR" },
  { name: "Alemán", speech: "de-DE" },
  { name: "Italiano", speech: "it-IT" },
  { name: "Portugués", speech: "pt-BR" },
  { name: "Japonés", speech: "ja-JP" },
  { name: "Chino", speech: "zh-CN" },
  { name: "Coreano", speech: "ko-KR" },
  { name: "Español", speech: "es-ES" },
];

export function speechCode(language: string) {
  return LANGUAGES.find((l) => l.name.toLowerCase() === language.toLowerCase())?.speech ?? "en-US";
}

export interface Profile {
  language: string;
  level: string;
  provider: string;
}

export const DEFAULT_PROFILE: Profile = { language: "Inglés", level: "A1", provider: "auto" };
