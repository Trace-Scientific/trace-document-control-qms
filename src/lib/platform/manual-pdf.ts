type ManualPdfSection = {
  sectionCode: string;
  title: string;
  revisionNumber: number;
  body: string;
};

type ManualPdfInput = {
  manualCode: string;
  manualName: string;
  version: string;
  status: string;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  releaseNotes: string;
  generatedAt: Date;
  sections: ManualPdfSection[];
};

function ascii(value: string) {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function wrap(value: string, width = 88) {
  const lines: string[] = [];
  for (const paragraph of ascii(value).split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if ((line + " " + word).length <= width) line += " " + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderManualReleasePdf(input: ManualPdfInput): Uint8Array {
  const lines: string[] = [
    input.manualName,
    `${input.manualCode} - Version ${input.version}`,
    `Release status: ${input.status}`,
    `Effective: ${input.effectiveAt ? input.effectiveAt.toISOString() : "Not scheduled"}`,
    `Published: ${input.publishedAt ? input.publishedAt.toISOString() : "Unpublished"}`,
    `Snapshot generated: ${input.generatedAt.toISOString()}`,
    "",
    "Release notes",
    ...wrap(input.releaseNotes),
    "",
  ];
  for (const section of input.sections) {
    lines.push(`${section.sectionCode} - ${section.title} (revision ${section.revisionNumber})`);
    lines.push(...wrap(section.body));
    lines.push("");
  }

  const pages: string[][] = [];
  const perPage = 54;
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(4 + i * 2);
    contentObjectIds.push(5 + i * 2);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index], contentId = contentObjectIds[index];
    const stream = [
      "BT",
      "/F1 10 Tf",
      "50 748 Td",
      "12 TL",
      ...page.map((line) => `(${pdfEscape(line)}) Tj T*`),
      `(Page ${index + 1} of ${pages.length}) Tj`,
      "ET",
    ].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "ascii"));
}
