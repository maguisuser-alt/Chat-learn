"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  BarChart3,
  Clapperboard,
  Gamepad2,
  GraduationCap,
  Layers,
  Menu,
  MessageSquare,
  Pencil,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import LessonPath from "@/components/language/LessonPath";
import MediaStudy from "@/components/language/MediaStudy";
import Games from "@/components/language/Games";
import ChatTutor from "@/components/ChatTutor";
import ResearchPanel from "@/components/ResearchPanel";
import SpeakingHub from "@/components/SpeakingHub";
import SettingsView from "@/components/SettingsView";
import LanguageBar from "@/components/language/LanguageBar";
import ProgressStats from "@/components/language/ProgressStats";
import CardsView from "@/components/study/CardsView";
import { useDecks } from "@/lib/useDecks";
import { useCloudDoc } from "@/lib/useCloudDoc";
import { combineSync, newest } from "@/lib/syncMerge";
import { dueWords } from "@/lib/srs";
import Logo from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useProgress } from "@/lib/progress";
import { useChatHistory, type ChatHistoryApi } from "@/lib/chatHistory";
import { SettingsProvider } from "@/lib/settings";
import { DEFAULT_PROFILE, type Profile } from "@/lib/languages";

type Tab = "chat" | "research" | "cards" | "lessons" | "stats" | "media" | "games" | "voice" | "settings";

type Group = "study" | "language";

const TABS: { id: Exclude<Tab, "settings">; label: string; Icon: typeof Search; group: Group }[] = [
  { id: "chat", label: "Chat de consulta", Icon: MessageSquare, group: "study" },
  { id: "research", label: "Investigar + videos", Icon: Search, group: "study" },
  { id: "cards", label: "Tarjetas y exámenes", Icon: Layers, group: "study" },
  { id: "lessons", label: "Lecciones", Icon: GraduationCap, group: "language" },
  { id: "stats", label: "Progreso", Icon: BarChart3, group: "language" },
  { id: "media", label: "Series y películas", Icon: Clapperboard, group: "language" },
  { id: "games", label: "Juegos", Icon: Gamepad2, group: "language" },
  { id: "voice", label: "Charla y pronunciación", Icon: AudioLines, group: "language" },
];

const GROUPS: { id: Group; label: string }[] = [
  { id: "study", label: "Estudio" },
  { id: "language", label: "Idiomas" },
];

type StoredProfile = Profile & { updatedAt?: number };

/** Perfil (idioma, nivel, IA) guardado por usuario en el navegador y, con cuenta, en MongoDB. */
function useProfile(userId: string | null, sync: boolean) {
  const key = userId ? `lingua-profile:${userId}` : "lingua-profile";
  const [stored, setStored] = useState<StoredProfile>(DEFAULT_PROFILE);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key) ?? (userId ? localStorage.getItem("lingua-profile") : null);
      setStored(raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE);
    } catch {
      setStored(DEFAULT_PROFILE); // perfil corrupto
    }
    setLoadedKey(key);
  }, [key, userId]);
  useEffect(() => {
    if (loadedKey === key) localStorage.setItem(key, JSON.stringify(stored));
  }, [stored, key, loadedKey]);
  const syncStatus = useCloudDoc<StoredProfile>({
    kind: "profile",
    enabled: sync,
    loadedKey: loadedKey === key ? key : null,
    value: stored,
    apply: (fn) => setStored((s) => fn(s)),
    merge: (local, remote) => newest(local, { ...DEFAULT_PROFILE, ...remote }),
  });
  const update = useCallback((p: Profile) => setStored({ ...p, updatedAt: Date.now() }), []);
  // Objeto estable mientras no cambie el perfil (hay efectos que dependen de él).
  const profile = useMemo<Profile>(
    () => ({ language: stored.language, level: stored.level, provider: stored.provider }),
    [stored.language, stored.level, stored.provider]
  );
  return [profile, update, syncStatus] as const;
}

/** Lista de chats recientes del menú lateral. */
function ChatList({ history, onPick }: { history: ChatHistoryApi; onPick: () => void }) {
  if (!history.chats.length) return null;
  return (
    <div className="space-y-0.5">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Chats recientes</p>
      <ul className="max-h-[32vh] space-y-0.5 overflow-y-auto">
        {history.chats.map((c) => (
          <li key={c.id} className="group relative">
            <button
              onClick={() => {
                history.select(c.id);
                onPick();
              }}
              className={`block w-full truncate rounded-xl py-2 pl-3 pr-16 text-left text-sm ${
                history.active.id === c.id ? "bg-[#ececec] font-medium" : "hover:bg-[#ececec]"
              }`}
              title={c.title}
            >
              {c.title}
            </button>
            <span className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={() => {
                  const t = window.prompt("Nuevo nombre del chat", c.title);
                  if (t) history.rename(c.id, t);
                }}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"
                aria-label={`Renombrar ${c.title}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => window.confirm(`¿Eliminar el chat «${c.title}»?`) && history.remove(c.id)}
                className="rounded-lg p-1 text-slate-500 hover:bg-rose-100 hover:text-rose-600"
                aria-label={`Eliminar ${c.title}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const user = useCurrentUser();
  const userId = user.ready ? user.userId : null;
  // Con cuenta de Google todo se guarda también en MongoDB para verlo en cualquier dispositivo.
  const cloud = user.authEnabled && !!user.email;
  const [profile, setProfile, profileSync] = useProfile(userId, cloud);
  const progressApi = useProgress(profile.language, userId, cloud);
  const history = useChatHistory(userId, cloud);
  const decks = useDecks(userId, cloud);
  const syncStatus = combineSync(progressApi.syncStatus, history.syncStatus, decks.syncStatus, profileSync);
  const [tab, setTab] = useState<Tab>("chat");
  const [settingsSection, setSettingsSection] = useState<string | undefined>();
  /** Abre Lecciones directamente en el test de nivel (una sola vez). */
  const [wantPlacement, setWantPlacement] = useState(false);
  const dueCount = dueWords(Object.values(progressApi.lang.words), Date.now(), 999).length;
  const [menuOpen, setMenuOpen] = useState(false);

  function selectTab(t: Tab) {
    setTab(t);
    setMenuOpen(false);
  }

  const openSettings = useCallback((section?: string) => {
    setSettingsSection(section);
    setTab("settings");
    setMenuOpen(false);
  }, []);

  function newChat(gemId?: string | null) {
    history.newChat(gemId);
    selectTab("chat");
  }

  const current = TABS.find((t) => t.id === tab);
  const title = tab === "settings" ? "Ajustes" : (current?.label ?? "");
  const isLanguage = current?.group === "language";

  // Estas secciones gestionan su propio alto y scroll; el resto se envuelve con ancho de lectura.
  const fullHeight = ["chat", "cards", "voice", "lessons", "stats", "media", "games"].includes(tab);

  return (
    <SettingsProvider userId={userId} sync={cloud}>
      <div className="flex h-dvh bg-white">
        {/* Fondo oscuro del menú en móvil */}
        {menuOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
        )}

        {/* Menú lateral (cajón en móvil, fijo en escritorio) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[300px] max-w-[85vw] flex-col gap-4 overflow-y-auto bg-[#f9f9f9] p-3 transition-transform lg:static lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <Logo className="size-8" />
              <span className="text-lg font-semibold">Lingua Tutor</span>
            </div>
            <button onClick={() => setMenuOpen(false)} className="rounded-full p-1.5 hover:bg-slate-200 lg:hidden" aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
          </div>

          <button
            onClick={() => newChat(null)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-medium hover:bg-slate-50"
          >
            <SquarePen className="size-5" /> Nuevo chat
          </button>

          <nav className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.id} className="space-y-0.5">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {g.label}
                  {g.id === "language" && progressApi.progress.streak > 0 && (
                    <span className="ml-2 normal-case text-orange-500">🔥 {progressApi.progress.streak}</span>
                  )}
                </p>
                {TABS.filter((t) => t.group === g.id).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => selectTab(id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ${
                      tab === id ? "bg-[#ececec] font-medium" : "hover:bg-[#ececec]"
                    }`}
                  >
                    <Icon className="size-5" /> {label}
                    {id === "lessons" && dueCount > 0 && (
                      <span className="ml-auto rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white" title="Palabras para repasar hoy">
                        {dueCount}
                      </span>
                    )}
                    {id === "cards" && decks.dueCount > 0 && (
                      <span className="ml-auto rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white" title="Tarjetas para repasar hoy">
                        {decks.dueCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            <ChatList history={history} onPick={() => selectTab("chat")} />
          </nav>

          <div className="mt-auto space-y-2">
            <button
              onClick={() => openSettings()}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ${
                tab === "settings" ? "bg-[#ececec] font-medium" : "hover:bg-[#ececec]"
              }`}
            >
              <Settings className="size-5" /> Ajustes
            </button>
            {user.authEnabled && user.email && (
              <UserMenu
                name={user.name}
                email={user.email}
                avatar={user.avatar}
                syncStatus={syncStatus}
                onOpenSettings={() => openSettings("account")}
              />
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 px-3">
            <button onClick={() => setMenuOpen(true)} className="rounded-full p-2 hover:bg-slate-100 lg:hidden" aria-label="Abrir menú">
              <Menu className="size-6" />
            </button>
            <h1 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
              <Logo className="size-6 shrink-0 lg:hidden" />
              <span className="truncate">{tab === "chat" && history.active.messages.length ? history.active.title : title}</span>
            </h1>
            {tab === "chat" && (
              <button onClick={() => newChat(null)} className="ml-auto rounded-full p-2 hover:bg-slate-100" aria-label="Nuevo chat" title="Nuevo chat">
                <SquarePen className="size-5" />
              </button>
            )}
            {isLanguage && <LanguageBar profile={profile} onChange={setProfile} />}
          </header>

          <main className="min-h-0 flex-1">
            {!user.ready || !userId || !history.loaded ? (
              <p className="p-6 text-slate-500">Cargando…</p>
            ) : fullHeight ? (
              <>
                {tab === "chat" && (
                  <ChatTutor
                    key={`${history.active.id}:${history.revision}`}
                    profile={profile}
                    history={history}
                    onOpenSettings={openSettings}
                    decks={decks}
                    onOpenCards={() => selectTab("cards")}
                  />
                )}
                {tab === "cards" && <CardsView decks={decks} provider={profile.provider} />}
                {tab === "voice" && (
                  <SpeakingHub profile={profile} userId={userId} onUserMessage={() => progressApi.addXp(1)} />
                )}
                {tab === "lessons" && (
                  <LessonPath
                    profile={profile}
                    api={progressApi}
                    onLevelChange={(level) => setProfile({ ...profile, level })}
                    startWithPlacement={wantPlacement}
                    onPlacementOpened={() => setWantPlacement(false)}
                  />
                )}
                {tab === "stats" && (
                  <ProgressStats
                    profile={profile}
                    api={progressApi}
                    onGo={(where) => {
                      if (where === "placement") setWantPlacement(true);
                      selectTab("lessons");
                    }}
                  />
                )}
                {tab === "media" && <MediaStudy profile={profile} api={progressApi} />}
                {tab === "games" && <Games profile={profile} api={progressApi} />}
              </>
            ) : (
              <div className="h-full overflow-y-auto px-4 pb-8">
                <div className="mx-auto max-w-3xl">
                  {tab === "research" && <ResearchPanel profile={profile} />}
                  {tab === "settings" && (
                    <SettingsView
                      profile={profile}
                      onProfileChange={setProfile}
                      history={history}
                      section={settingsSection}
                      user={{ ...user, userId }}
                      syncStatus={syncStatus}
                      onUseGem={(gemId) => newChat(gemId)}
                    />
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SettingsProvider>
  );
}
