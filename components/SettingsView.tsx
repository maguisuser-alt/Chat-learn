"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bot,
  Brain,
  Database,
  Download,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Sun,
  User,
  UserCircle,
  Volume2,
} from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import SettingsBar from "@/components/SettingsBar";
import { LEVELS } from "@/lib/schemas";
import { LANGUAGES, type Profile } from "@/lib/languages";
import type { ChatHistoryApi } from "@/lib/chatHistory";
import type { SyncStatus } from "@/lib/progress";
import { useReadAloud } from "@/lib/readAloud";
import {
  DICTATION_LANGS,
  GEM_TEMPLATES,
  LIMITS,
  uid,
  useSettings,
  VOICE_OPTIONS,
  type Gem,
  type ResponseLength,
} from "@/lib/settings";

export const SECTIONS = [
  { id: "personalization", label: "Personalización", Icon: User },
  { id: "appearance", label: "Apariencia", Icon: Palette },
  { id: "memory", label: "Memoria", Icon: Brain },
  { id: "gems", label: "Asistentes", Icon: Bot },
  { id: "ai", label: "IA y razonamiento", Icon: Sparkles },
  { id: "voice", label: "Voz", Icon: Volume2 },
  { id: "languages", label: "Idiomas", Icon: Languages },
  { id: "data", label: "Datos y privacidad", Icon: Database },
  { id: "account", label: "Cuenta", Icon: UserCircle },
] as const;

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  history: ChatHistoryApi;
  /** Sección a la que desplazarse al abrir. */
  section?: string;
  user: { authEnabled: boolean; name: string | null; email: string | null; avatar: string | null; userId: string | null };
  syncStatus: SyncStatus;
  /** Abre un chat nuevo con el asistente indicado. */
  onUseGem: (gemId: string) => void;
}

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600";

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {desc && <p className="text-sm text-slate-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/** Editor de un asistente personalizado. */
function GemForm({ initial, onSave, onCancel }: { initial: Gem; onSave: (g: Gem) => void; onCancel: () => void }) {
  const [gem, setGem] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (gem.name.trim() && gem.instructions.trim()) onSave(gem);
      }}
      className="space-y-3 rounded-2xl border border-brand-600/40 bg-brand-50/40 p-4"
    >
      <div className="flex gap-2">
        <input
          value={gem.emoji}
          onChange={(e) => setGem({ ...gem, emoji: e.target.value })}
          maxLength={4}
          aria-label="Emoji"
          className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-2 text-center text-xl"
        />
        <input
          value={gem.name}
          onChange={(e) => setGem({ ...gem, name: e.target.value })}
          maxLength={60}
          placeholder="Nombre del asistente"
          className={field}
          autoFocus
        />
      </div>
      <textarea
        value={gem.instructions}
        onChange={(e) => setGem({ ...gem, instructions: e.target.value })}
        maxLength={LIMITS.gemInstructions}
        rows={6}
        placeholder="Instrucciones: qué papel tiene, cómo debe responder, qué debe evitar…"
        className={field}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {gem.instructions.length}/{LIMITS.gemInstructions}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-1.5 text-sm hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!gem.name.trim() || !gem.instructions.trim()}
            className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </form>
  );
}

export default function SettingsView({ profile, onProfileChange, history, section, user, syncStatus, onUseGem }: Props) {
  const { settings, update, addMemory, removeMemory, saveGem, removeGem } = useSettings();
  const [editingGem, setEditingGem] = useState<Gem | null>(null);
  const [newMemory, setNewMemory] = useState("");
  const [shareData, setShareData] = useState<boolean | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const read = useReadAloud(settings.voice);
  const [theme, setTheme] = useTheme();
  const installer = useInstallPrompt();
  const rootRef = useRef<HTMLDivElement>(null);

  // Desplaza a la sección pedida (p. ej. desde "Memoria guardada" en el chat).
  useEffect(() => {
    if (!section) return;
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section]);

  // Permiso de datos (solo con cuenta y base de datos).
  useEffect(() => {
    if (!user.authEnabled || !user.email) return;
    fetch("/api/me")
      .then((r) => r.json())
      .then((j: { available?: boolean; shareData?: boolean }) => setShareData(j.available ? (j.shareData ?? false) : null))
      .catch(() => setShareData(null));
  }, [user.authEnabled, user.email]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function toggleConsent(next: boolean) {
    setSavingConsent(true);
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareData: next }),
      });
      if (r.ok) {
        setShareData(next);
        flash(next ? "Gracias: tus conversaciones ayudarán a mejorar la IA." : "Permiso retirado y conversaciones guardadas borradas.");
      } else flash("No se pudo guardar el permiso.");
    } finally {
      setSavingConsent(false);
    }
  }

  /** Descarga en JSON todo lo que la app guarda de esta cuenta en el navegador. */
  function exportData() {
    const suffix = user.userId ?? "anon";
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith("lingua-") && (key.endsWith(`:${suffix}`) || !key.includes(":"))) {
        try {
          data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), account: user.email, data }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lingua-tutor-mis-datos.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function clearBrowserData() {
    if (!window.confirm("Se borrará de este navegador tu historial de chats, ajustes, memoria, asistentes, progreso y caché. ¿Continuar?")) return;
    const suffix = user.userId ?? "anon";
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith("lingua-") && key !== "lingua-client-id" && (key.endsWith(`:${suffix}`) || !key.includes(":") || key.startsWith("lingua-lesson:") || key.startsWith("lingua-media:") || key.startsWith("lingua-game-words:"))) {
        remove.push(key);
      }
    }
    remove.forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  }

  const p = settings.personalization;
  const setP = (patch: Partial<typeof p>) => update({ personalization: { ...p, ...patch } });
  const v = settings.voice;
  const setV = (patch: Partial<typeof v>) => update({ voice: { ...v, ...patch } });

  return (
    <div ref={rootRef} className="space-y-8 py-4">
      {/* Índice de secciones */}
      <nav className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-white px-1 py-2">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <Section id="personalization" title="Personalización" desc="La IA tendrá esto en cuenta en todos los chats.">
        <div className={`${card} space-y-4`}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">¿Qué debería saber la IA sobre ti?</span>
            <textarea
              value={p.about}
              onChange={(e) => setP({ about: e.target.value })}
              maxLength={LIMITS.about}
              rows={3}
              placeholder="Ej.: Estudio 2.º de bachillerato, me cuesta la química y quiero aprobar la selectividad."
              className={field}
            />
            <span className="block text-right text-xs text-slate-400">{p.about.length}/{LIMITS.about}</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">¿Cómo quieres que responda?</span>
            <textarea
              value={p.style}
              onChange={(e) => setP({ style: e.target.value })}
              maxLength={LIMITS.style}
              rows={3}
              placeholder="Ej.: Con ejemplos de la vida diaria, tono cercano y sin tecnicismos innecesarios."
              className={field}
            />
            <span className="block text-right text-xs text-slate-400">{p.style.length}/{LIMITS.style}</span>
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Extensión de las respuestas</span>
            <div className="flex flex-wrap gap-2">
              {(["breve", "normal", "detallada"] as ResponseLength[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setP({ length: l })}
                  className={`rounded-full px-4 py-1.5 text-sm capitalize ${p.length === l ? "bg-black text-white" : "border border-slate-200 hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="appearance" title="Apariencia" desc="El tema se guarda en este dispositivo.">
        <div className={`${card} space-y-5`}>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tema</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tema">
              {(
                [
                  { id: "system", label: "Sistema", Icon: Monitor },
                  { id: "light", label: "Claro", Icon: Sun },
                  { id: "dark", label: "Oscuro", Icon: Moon },
                ] as { id: ThemePref; label: string; Icon: typeof Sun }[]
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium ${
                    theme === id ? "bg-black text-white" : "border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            {theme === "system" && <p className="text-xs text-slate-500">Sigue el modo claro u oscuro de tu sistema.</p>}
          </div>

          <div className="space-y-1.5 border-t border-slate-200 pt-4">
            <span className="text-sm font-medium">Instalar como app</span>
            {installer.state === "installed" && (
              <p className="text-sm text-brand-700">Lingua Tutor ya está instalada en este dispositivo.</p>
            )}
            {installer.state === "available" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-xs text-slate-500">Ábrela desde el escritorio o la pantalla de inicio, en su propia ventana.</p>
                <button
                  type="button"
                  onClick={async () => flash((await installer.install()) ? "App instalada" : "Instalación cancelada")}
                  className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white"
                >
                  <Download className="size-4" /> Instalar
                </button>
              </div>
            )}
            {installer.state === "ios" && (
              <p className="text-xs text-slate-500">En Safari pulsa Compartir y luego «Añadir a pantalla de inicio».</p>
            )}
            {installer.state === "unsupported" && (
              <p className="text-xs text-slate-500">
                Usa Chrome o Edge y busca el icono de instalar en la barra de direcciones (o el menú ⋮ › «Instalar Lingua Tutor»). La
                instalación requiere la versión publicada (HTTPS) o localhost en modo producción.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section id="memory" title="Memoria" desc="Datos que la IA recuerda entre chats. Los guarda cuando cuentas algo útil sobre ti o se lo pides.">
        <div className={`${card} space-y-4`}>
          <Toggle
            checked={settings.memoryEnabled}
            onChange={(memoryEnabled) => update({ memoryEnabled })}
            label="Recordar datos entre chats"
            hint="Desactivado, la IA no usa ni guarda recuerdos (los guardados se conservan)."
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newMemory.trim()) {
                addMemory(newMemory);
                setNewMemory("");
              }
            }}
            className="flex gap-2"
          >
            <input
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              maxLength={LIMITS.memory}
              placeholder="Añadir un recuerdo, p. ej. «Prefiero ejemplos con fútbol»"
              className={field}
            />
            <button type="submit" disabled={!newMemory.trim()} className="shrink-0 rounded-xl bg-brand-600 px-3 text-white disabled:opacity-50" aria-label="Añadir recuerdo">
              <Plus className="size-5" />
            </button>
          </form>
          {settings.memories.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay recuerdos guardados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {settings.memories.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                  <Brain className="size-4 shrink-0 text-violet-500" />
                  <span className="flex-1">{m.text}</span>
                  <span className="hidden text-xs text-slate-400 sm:inline">{new Date(m.createdAt).toLocaleDateString("es-ES")}</span>
                  <button type="button" onClick={() => removeMemory(m.id)} className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Olvidar: ${m.text}`}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {settings.memories.length > 0 && (
            <button
              type="button"
              onClick={() => window.confirm("¿Borrar todos los recuerdos?") && update({ memories: [] })}
              className="text-sm text-rose-600 hover:underline"
            >
              Borrar toda la memoria
            </button>
          )}
        </div>
      </Section>

      <Section id="gems" title="Asistentes" desc="Crea asistentes con instrucciones propias y elígelos en el chat (arriba a la izquierda).">
        <div className="space-y-3">
          {editingGem && (
            <GemForm
              initial={editingGem}
              onCancel={() => setEditingGem(null)}
              onSave={(g) => {
                saveGem(g);
                setEditingGem(null);
                flash("Asistente guardado.");
              }}
            />
          )}
          {settings.gems.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {settings.gems.map((g) => (
                <li key={g.id} className={`${card} flex flex-col gap-2 !p-4`}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="flex-1 truncate font-semibold">{g.name}</span>
                    <button type="button" onClick={() => setEditingGem(g)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label={`Editar ${g.name}`}>
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`¿Eliminar «${g.name}»?`) && removeGem(g.id)}
                      className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Eliminar ${g.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-500">{g.instructions}</p>
                  <button type="button" onClick={() => onUseGem(g.id)} className="self-start rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                    Nuevo chat con este asistente
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!editingGem && (
            <div className={`${card} space-y-3`}>
              <button
                type="button"
                onClick={() => setEditingGem({ id: uid(), name: "", emoji: "🤖", instructions: "" })}
                className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus className="size-4" /> Crear asistente
              </button>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">O empieza con una plantilla</p>
              <div className="flex flex-wrap gap-2">
                {GEM_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setEditingGem({ ...t, id: uid() })}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    {t.emoji} {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section id="ai" title="IA y razonamiento">
        <div className={`${card} space-y-4`}>
          <SettingsBar profile={profile} onChange={onProfileChange} showLanguage={false} />
          <Toggle
            checked={settings.reasoningDefault}
            onChange={(reasoningDefault) => update({ reasoningDefault })}
            label="Razonar por defecto"
            hint="La IA piensa paso a paso antes de responder y puedes ver su razonamiento. Más lento; útil en matemáticas y ciencias."
          />
        </div>
      </Section>

      <Section id="voice" title="Voz">
        <div className={`${card} space-y-4`}>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Voz para leer respuestas</span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "browser", label: "Navegador", hint: "instantánea, sin cuota" },
                { id: "natural", label: "Natural (Gemini)", hint: "más humana, usa cuota" },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setV({ engine: o.id as typeof v.engine })}
                  className={`rounded-2xl px-4 py-2 text-left text-sm ${v.engine === o.id ? "bg-black text-white" : "border border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="block font-medium">{o.label}</span>
                  <span className={`block text-xs ${v.engine === o.id ? "text-white/70" : "text-slate-500"}`}>{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Voz natural</span>
              <select value={v.name} onChange={(e) => setV({ name: e.target.value })} disabled={v.engine !== "natural"} className={`${field} disabled:opacity-50`}>
                {VOICE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Idioma del dictado y de la voz del navegador</span>
              <select value={v.dictationLang} onChange={(e) => setV({ dictationLang: e.target.value })} className={field}>
                {DICTATION_LANGS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <Toggle checked={v.autoRead} onChange={(autoRead) => setV({ autoRead })} label="Leer las respuestas automáticamente" hint="Cada respuesta del chat se lee en voz alta al terminar." />
          <button
            type="button"
            onClick={() => (read.playing ? read.stop() : read.speak("test", "Hola, soy tu tutor de estudio. Así sonarán mis respuestas."))}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50"
          >
            <Volume2 className="size-4" /> {read.loading ? "Cargando…" : read.playing ? "Detener" : "Probar voz"}
          </button>
          {read.notice && <p className="text-xs text-amber-700">{read.notice}</p>}
        </div>
      </Section>

      <Section id="languages" title="Idiomas" desc="Idioma y nivel para lecciones, series, juegos, charla y pronunciación.">
        <div className={`${card} grid gap-3 sm:grid-cols-2`}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Idioma que estudias</span>
            <select value={profile.language} onChange={(e) => onProfileChange({ ...profile, language: e.target.value })} className={field}>
              {LANGUAGES.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Nivel (MCER)</span>
            <select value={profile.level} onChange={(e) => onProfileChange({ ...profile, level: e.target.value })} className={field}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section id="data" title="Datos y privacidad" desc="El historial, la memoria y los asistentes se guardan en este navegador.">
        <div className={`${card} space-y-4`}>
          {shareData !== null ? (
            <Toggle
              checked={shareData}
              disabled={savingConsent}
              onChange={toggleConsent}
              label="Ayudar a mejorar la IA"
              hint="Guarda tus preguntas y respuestas en el servidor para evaluar y mejorar el tutor. Nunca guarda tus archivos. Al desactivarlo se borran."
            />
          ) : (
            <p className="text-sm text-slate-500">
              {user.authEnabled ? "La opción de ayudar a mejorar la IA necesita la base de datos configurada." : "Inicia sesión para poder ayudar a mejorar la IA."}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={exportData} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50">
              <Download className="size-4" /> Exportar mis datos
            </button>
            <button
              type="button"
              disabled={!history.chats.length}
              onClick={() => {
                if (window.confirm(`¿Borrar los ${history.chats.length} chats del historial?`)) {
                  history.clearAll();
                  flash("Historial borrado.");
                }
              }}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Borrar historial de chats ({history.chats.length})
            </button>
            <button type="button" onClick={clearBrowserData} className="flex items-center gap-2 rounded-full border border-rose-200 px-4 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
              <Trash2 className="size-4" /> Borrar todo en este navegador
            </button>
          </div>
        </div>
      </Section>

      <Section id="account" title="Cuenta">
        <div className={`${card} flex flex-wrap items-center gap-4`}>
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="size-12 rounded-full object-cover" />
          ) : (
            <UserCircle className="size-12 text-slate-300" />
          )}
          <div className="min-w-0 flex-1">
            {user.authEnabled && user.email ? (
              <>
                <p className="truncate font-semibold">{user.name ?? "Usuario"}</p>
                <p className="truncate text-sm text-slate-500">{user.email}</p>
                <p className="text-xs text-slate-400">
                  Progreso de idiomas:{" "}
                  {syncStatus === "ok" ? "sincronizado" : syncStatus === "syncing" ? "sincronizando…" : syncStatus === "error" ? "solo en este navegador" : "—"}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Sin cuenta</p>
                <p className="text-sm text-slate-500">Todo se guarda solo en este navegador.</p>
              </>
            )}
          </div>
          {user.authEnabled && user.email && (
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-2 rounded-full border border-rose-200 px-4 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          )}
        </div>
      </Section>
    </div>
  );
}
