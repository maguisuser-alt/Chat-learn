"use client";

export interface ExportSection {
  heading?: string;
  text: string;
}

export interface ExportOptions {
  filename?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  sections: ExportSection[];
}

/** Convierte Markdown básico en texto plano. */
function mdToPlain(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
export async function exportPDF(opts: ExportOptions) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const MARGIN = 20;
  const LINE = 170; // 210 - 2*20
  let y = 20;

  function write(text: string, size: number, bold = false, color = "#1a1a1a") {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, LINE) as string[];
    if (y + lines.length * (size * 0.45) > 285) { doc.addPage(); y = 20; }
    doc.text(lines, MARGIN, y);
    y += lines.length * (size * 0.45) + 2;
  }

  if (opts.title) write(opts.title, 20, true, "#10a37f");
  if (opts.subtitle) write(opts.subtitle, 13, false, "#555555");
  if (opts.title || opts.subtitle) y += 5;

  for (const s of opts.sections) {
    if (s.heading) { y += 4; write(s.heading, 14, true, "#10a37f"); }
    write(mdToPlain(s.text), 11);
    y += 3;
  }

  if (opts.author) {
    if (y > 265) { doc.addPage(); y = 20; }
    write(`— ${opts.author}`, 10, false, "#888888");
  }

  doc.save(`${opts.filename ?? "lingua"}.pdf`);
}

// ─── DOCX (Word) ─────────────────────────────────────────────────────────────
export async function exportDOCX(opts: ExportOptions) {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = await import("docx");
  type Parag = InstanceType<typeof Paragraph>;
  const children: Parag[] = [];

  if (opts.title) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: opts.title, bold: true, color: "10a37f" })],
    }));
  }
  if (opts.subtitle) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: opts.subtitle, color: "555555" })],
    }));
    children.push(new Paragraph(""));
  }

  for (const s of opts.sections) {
    if (s.heading) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: s.heading, bold: true, color: "10a37f" })],
      }));
    }
    for (const line of s.text.split("\n")) {
      const plain = mdToPlain(line);
      if (!plain) { children.push(new Paragraph("")); continue; }
      const isBullet = /^[-*•]\s+/.test(line);
      children.push(new Paragraph({
        bullet: isBullet ? { level: 0 } : undefined,
        children: [new TextRun({ text: plain.replace(/^•\s*/, "") })],
      }));
    }
    children.push(new Paragraph(""));
  }

  if (opts.author) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `— ${opts.author}`, italics: true, color: "888888" })],
    }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  // Convierte el Buffer de Node.js a ArrayBuffer puro para que `new Blob` lo acepte.
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  triggerDownload(
    new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    `${opts.filename ?? "lingua"}.docx`
  );
}

// ─── XLSX (Excel con SheetJS) ─────────────────────────────────────────────────
export async function exportXLSX(opts: ExportOptions) {
  const XLSX = await import("xlsx");
  const rows: string[][] = [];

  if (opts.title) rows.push([opts.title]);
  if (opts.subtitle) rows.push([opts.subtitle]);
  if (opts.title || opts.subtitle) rows.push([""]);

  for (const s of opts.sections) {
    if (s.heading) { rows.push([""]); rows.push([s.heading]); }
    for (const line of s.text.split("\n")) {
      rows.push([mdToPlain(line)]);
    }
  }
  if (opts.author) { rows.push([""]); rows.push([`— ${opts.author}`]); }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, ws, (opts.title ?? "Lingua").slice(0, 31));
  XLSX.writeFile(wb, `${opts.filename ?? "lingua"}.xlsx`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Extrae el texto de los mensajes del asistente para exportar. */
export function chatToExportSections(
  messages: { role: string; parts: { type: string; text?: string }[] }[]
): ExportSection[] {
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m, i) => {
      const text = m.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("").trim();
      return text ? [{ heading: `Respuesta ${i + 1}`, text }] : [];
    });
}
