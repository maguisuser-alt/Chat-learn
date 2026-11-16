"use client";

import { useState } from "react";
import { AudioLines, Mic } from "lucide-react";
import TalkCoach from "@/components/TalkCoach";
import PronunciationPractice from "@/components/PronunciationPractice";
import type { Profile } from "@/lib/languages";

interface Props {
  profile: Profile;
  userId: string;
  onUserMessage?: () => void;
}

/** Charla y pronunciación juntas: conversación con corrección, o frases sueltas para practicar. */
export default function SpeakingHub({ profile, userId, onUserMessage }: Props) {
  const [mode, setMode] = useState<"talk" | "phrases">("talk");
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl px-4 pt-3">
        <div className="flex rounded-full bg-[#f4f4f4] p-1 text-sm font-medium" role="tablist">
          {(
            [
              { id: "talk", label: "Conversación", Icon: AudioLines },
              { id: "phrases", label: "Practicar frases", Icon: Mic },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 ${mode === id ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {/* La charla se mantiene montada para no perder la conversación al cambiar de pestaña. */}
        <div className={mode === "talk" ? "h-full" : "hidden"}>
          <TalkCoach profile={profile} userId={userId} onUserMessage={onUserMessage} />
        </div>
        {mode === "phrases" && (
          <div className="h-full overflow-y-auto px-4 pb-8 pt-3">
            <div className="mx-auto max-w-3xl">
              <PronunciationPractice profile={profile} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
