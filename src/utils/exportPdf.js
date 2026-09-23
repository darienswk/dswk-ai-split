import { jsPDF } from "jspdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDate, getItemType } from "./itinerary";

// A4 in points, matching jsPDF's default "pt"/"a4" combination.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 24;
const STOP_INDENT = 14;
const MAX_IMAGE_HEIGHT = 180; // pt - caps a tall portrait photo so it doesn't dominate the page

const INK = [30, 30, 35];
const MUTED = [110, 110, 120];
const RULE = [210, 210, 220];

// jsPDF's addImage / pdf-lib's embedJpg|embedPng only handle these two formats natively.
// Anything else (HEIC, WEBP, GIF, SVG, ...) falls back to a text line instead of a broken embed.
const SUPPORTED_IMAGE_FORMATS = { "image/jpeg": "JPEG", "image/jpg": "JPEG", "image/png": "PNG" };

export function sanitizeFilename(name) {
  const safe = (name || "").trim().replace(/[^\w.-]+/g, "_").slice(0, 80);
  return safe && !/^_+$/.test(safe) ? safe : "itinerary";
}

// "image" -> handled inline, either embedded (if the format is one embedImage() supports) or as
// a text fallback; "pdf" -> goes in the appendix; "unsupported" -> some other file type we don't
// have special handling for, so it's left out of the PDF entirely (same as before attachments
// were referenced at all).
export function classifyAttachment(attachment) {
  if (attachment.contentType?.startsWith("image/")) return "image";
  if (attachment.contentType === "application/pdf") return "pdf";
  return "unsupported";
}

// Reads pixel dimensions straight out of PNG/JPEG headers (no decoding, no DOM Image needed) so
// an inline image can be scaled to fit the page without distortion. Returns null if it can't tell.
export function getImageDimensions(bytes, contentType) {
  if (!bytes || bytes.byteLength < 4) return null;
  const view = new DataView(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);

  if (contentType === "image/png") {
    if (bytes.byteLength < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    let offset = 2; // skip the SOI marker
    while (offset < view.byteLength - 4) {
      if (view.getUint8(offset) !== 0xff) return null;
      const marker = view.getUint8(offset + 1);
      // SOFn markers (0xC0-0xCF) carry the frame's height/width, except the DHT/JPG/DAC markers.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  }

  return null;
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToDataUrl(bytes, contentType) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:${contentType};base64,${btoa(binary)}`;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Renders an itinerary to a downloadable PDF: day-by-day stops, with image attachments shown
// inline and PDF attachments merged in as an appendix (with an inline "see Appendix Ax" note).
export async function exportItineraryToPdf(itinerary) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;
  const pdfAppendix = []; // { ref, stopTitle, name, url }

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Writes wrapped text, reserving space first so a block never splits mid-way without warning.
  const write = (text, { size = 10, style = "normal", color = INK, indent = 0, gap = 4 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), CONTENT_WIDTH - indent);
    const lineHeight = size * 1.28;
    ensureSpace(lines.length * lineHeight + gap);
    lines.forEach((line, i) => doc.text(line, MARGIN + indent, y + i * lineHeight));
    y += lines.length * lineHeight + gap;
  };

  // Fetches and embeds an image attachment inline; falls back to a text note if that fails or
  // the format isn't one jsPDF can embed.
  const embedImage = async (attachment) => {
    const format = SUPPORTED_IMAGE_FORMATS[attachment.contentType];
    if (!format) {
      write(`Image: ${attachment.name} (preview not available for this file type)`, {
        size: 9.5,
        style: "italic",
        color: MUTED,
        indent: STOP_INDENT,
        gap: 2,
      });
      return;
    }
    try {
      const bytes = await fetchBytes(attachment.url);
      const dims = getImageDimensions(bytes, attachment.contentType) || { width: 4, height: 3 };
      const maxWidth = CONTENT_WIDTH - STOP_INDENT;
      const scale = Math.min(maxWidth / dims.width, MAX_IMAGE_HEIGHT / dims.height, 1);
      const w = dims.width * scale;
      const h = dims.height * scale;
      ensureSpace(h + 8);
      doc.addImage(bytesToDataUrl(bytes, attachment.contentType), format, MARGIN + STOP_INDENT, y, w, h);
      y += h + 8;
    } catch (err) {
      console.error(`Failed to embed image attachment "${attachment.name}":`, err);
      write(`Image: ${attachment.name} (couldn't be loaded)`, {
        size: 9.5,
        style: "italic",
        color: MUTED,
        indent: STOP_INDENT,
        gap: 2,
      });
    }
  };

  write(itinerary.name || "Untitled Itinerary", { size: 20, style: "bold", gap: 6 });

  const range = `${formatDate(itinerary.startDate, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })} – ${formatDate(itinerary.endDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
  write(range, { size: 11, color: MUTED, gap: itinerary.description ? 4 : 6 });

  if (itinerary.description) {
    write(itinerary.description, { size: 10, style: "italic", color: MUTED, gap: 6 });
  }

  const generatedOn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  write(`Generated ${generatedOn}`, { size: 8, color: MUTED, gap: 16 });

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];
    ensureSpace(100); // heading + rule + at least one line, so a heading doesn't get orphaned
    const heading = `Day ${dayIndex + 1} — ${formatDate(day.id, {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}${day.city ? ` · ${day.city}` : ""}`;
    write(heading, { size: 13, style: "bold", gap: 6 });
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 10;

    if (day.items.length === 0) {
      write("No stops planned.", { size: 9.5, style: "italic", color: MUTED, gap: 14 });
      continue;
    }

    for (const item of day.items) {
      const type = getItemType(item.type);
      write(`${item.time || "—"}   ${type.label}: ${item.title}`, { size: 10.5, style: "bold", gap: 2 });
      if (item.location) {
        write(`Location: ${item.location}`, { size: 9.5, color: MUTED, indent: STOP_INDENT, gap: 2 });
      }
      if (item.notes) {
        write(item.notes, { size: 9.5, style: "italic", color: MUTED, indent: STOP_INDENT, gap: 2 });
      }

      for (const attachment of item.attachments || []) {
        const kind = classifyAttachment(attachment);
        if (kind === "image") {
          await embedImage(attachment);
        } else if (kind === "pdf") {
          const ref = `A${pdfAppendix.length + 1}`;
          pdfAppendix.push({ ref, stopTitle: item.title, name: attachment.name, url: attachment.url });
          write(`Document: ${attachment.name} (see Appendix ${ref})`, {
            size: 9.5,
            color: MUTED,
            indent: STOP_INDENT,
            gap: 2,
          });
        }
      }
      y += 6;
    }
    y += 8;
  }

  const mainPageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= mainPageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${itinerary.name || "Itinerary"} · Page ${p} of ${mainPageCount}`, MARGIN, PAGE_HEIGHT - 20);
  }

  const filename = `${sanitizeFilename(itinerary.name)}.pdf`;

  if (pdfAppendix.length === 0) {
    doc.save(filename);
    return;
  }

  // Hand off to pdf-lib, which (unlike jsPDF) can import pages from other PDF files.
  const finalDoc = await PDFDocument.load(doc.output("arraybuffer"));
  await appendPdfAttachments(finalDoc, pdfAppendix);
  downloadBytes(await finalDoc.save(), filename);
}

// Adds an "Appendix" index page listing each reference, then merges every attached PDF's own
// pages onto the end, in the same order they were referenced.
async function appendPdfAttachments(finalDoc, appendixItems) {
  const font = await finalDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await finalDoc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(...INK.map((c) => c / 255));
  const muted = rgb(...MUTED.map((c) => c / 255));

  let page = finalDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const newPage = () => {
    page = finalDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const line = (text, { size = 10, bold = false, color = ink, gap = 16 } = {}) => {
    if (y - size < MARGIN) newPage();
    page.drawText(text, { x: MARGIN, y: y - size, size, font: bold ? fontBold : font, color });
    y -= gap;
  };

  line("Appendix — Attached Documents", { size: 15, bold: true, gap: 26 });

  const results = [];
  for (const item of appendixItems) {
    try {
      const donorBytes = await fetchBytes(item.url);
      const donor = await PDFDocument.load(donorBytes);
      const copied = await finalDoc.copyPages(donor, donor.getPageIndices());
      results.push({ item, copied });
    } catch (err) {
      console.error(`Failed to append PDF attachment "${item.name}":`, err);
      results.push({ item, copied: null });
    }
  }

  results.forEach(({ item, copied }) => {
    const status = copied ? "" : "  (unavailable)";
    line(`${item.ref} — ${item.stopTitle} — ${item.name}${status}`, { size: 10, color: muted });
  });

  results.forEach(({ copied }) => copied && copied.forEach((p) => finalDoc.addPage(p)));
}
