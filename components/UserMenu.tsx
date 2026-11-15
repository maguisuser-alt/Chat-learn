"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Settings, UserCircle } from "lucide-react";
import type { SyncStatus } from "@/lib/progress";

interface Props {
  name: string | null;
  email: string | null;
  avatar: string | null;
  syncStatus?: SyncStatus;
  onOpenSettings: () => void;
}

const SYNC_LABEL: Record<SyncStatus, { text: string; cls: string } | null> = {
  off: null,
  syncing: { text: "Sincronizando…", cls: "text-slate-400" },
  ok: { text: "Progreso sincronizado", cls: "text-brand-700" },
  error: { text: "Sin sincronizar (solo en este navegador)", cls: "text-amber-600" },
};

export default function UserMenu({ name, email, avatar, syncStatus = "off", onOpenSettings }: Props) {
  const sync = SYNC_LABEL[syncStatus];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-200"
        aria-label="Menú de usuario"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name ?? "Avatar"} className="size-8 rounded-full object-cover" />
        ) : (
          <UserCircle className="size-8 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-medium leading-tight">{name ?? "Usuario"}</span>
          <span className="block truncate text-xs text-slate-500">{email}</span>
          {sync && <span className={`block truncate text-[11px] ${sync.cls}`}>{sync.text}</span>}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute bottom-14 left-0 right-0 z-50 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-100"
            >
              <Settings className="size-4" /> Ajustes
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
