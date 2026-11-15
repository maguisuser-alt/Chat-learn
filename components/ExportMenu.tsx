"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { chatToExportSections, exportDOCX, exportPDF, exportXLSX, type ExportOptions } from "@/lib/exportDoc";

type Fmt = "pdf" | "docx" | "xlsx";

interface Props {
  messages: { role: string; parts: { type: string; text?: string }[] }[];
  title?: string;
}

const FORMATS: { id: Fmt; label: string; Icon: typeof FileText; ext: string; color: string }[] = [
  { id: "pdf", label: "PDF", Icon: FileType, ext: "pdf", color: "text-rose-600" },
  { id: "docx", label: "Word", Icon: FileText, ext: "docx", color: "text-sky-600" },
  { id: "xlsx", label: "Excel", Icon: FileSpreadsheet, ext: "xlsx", color: "text-emerald-600" },
];

export default function ExportMenu({ messages, title }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Fmt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  async function run(fmt: Fmt) {
    setLoading(fmt);
    setError(null);
    setOpen(false);
    try {
      const opts: ExportOptions = {
        title: title ?? "Consulta con Lingua Tutor",
        subtitle: `${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`,
        author: "Lingua Tutor",
        filename: `lingua-${Date.now()}`,
        sections: chatToExportSections(messages),
      };
      if (fmt === "pdf") await exportPDF(opts);
      else if (fmt === "docx") await exportDOCX(opts);
      else await exportXLSX(opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el archivo");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!loading}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        aria-label="Exportar conversación"
      >
        <Download className="size-4" />
        {loading ? `Generando ${loading.toUpperCase()}…` : "Exportar"}
      </button>

      {error && (
        <p className="absolute left-0 top-9 z-30 w-72 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {FORMATS.map(({ id, label, Icon, color }) => (
              <button
                key={id}
                onClick={() => run(id)}
                disabled={!!loading}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-60"
              >
                <Icon className={`size-4 ${color}`} />
                <span>
                  Descargar <b>.{id}</b>
                </span>
                <span className="ml-auto text-xs text-slate-400">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
