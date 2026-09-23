import { PDFDocument } from "pdf-lib";
import { classifyAttachment, exportItineraryToPdf, getImageDimensions, sanitizeFilename } from "./exportPdf";
import { createItinerary } from "./itinerary";

// Fake jsPDF that records every call. Treated as an external side-effecting library for the
// text-layout assertions below. `output()` returns a real, minimal pdf-lib-built PDF (set in
// beforeAll) so the *real* pdf-lib merge step this feature depends on has valid bytes to load -
// that merge step is the genuinely new/risky logic here, so it runs for real rather than being
// faked. Names start with "mock" so jest allows the factory below to reference them.
let mockCalls;
let mockPlaceholderBytes; // a real, valid 1-page PDF stand-in for jsPDF's own output

jest.mock("jspdf", () => {
  class FakeJsPDF {
    constructor() {
      mockCalls = { text: [], images: [], addPage: 0, save: null };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    splitTextToSize(text) {
      return [String(text)];
    }
    text(str) {
      mockCalls.text.push(str);
    }
    line() {}
    addImage(data, format, x, y, w, h) {
      mockCalls.images.push({ format, w, h });
    }
    addPage() {
      mockCalls.addPage += 1;
    }
    setPage() {}
    get internal() {
      return { getNumberOfPages: () => mockCalls.addPage + 1 };
    }
    output() {
      return mockPlaceholderBytes;
    }
    save(filename) {
      mockCalls.save = filename;
    }
  }
  return { jsPDF: FakeJsPDF };
});

beforeAll(async () => {
  const placeholder = await PDFDocument.create();
  placeholder.addPage([595.28, 841.89]);
  mockPlaceholderBytes = await placeholder.save();
});

// --- Fixtures -------------------------------------------------------------

function makePng(width, height) {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0); // PNG signature
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function makeJpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x0b, // segment length
    0x01, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9, // EOI
  ]);
}

async function makeDonorPdf(pageCount) {
  const donor = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) donor.addPage([300, 300]);
  return donor.save();
}

const attachment = (overrides) => ({
  id: "att-1",
  name: "file",
  url: "https://example.com/file",
  contentType: "application/octet-stream",
  size: 100,
  uploadedAt: "2026-09-23T00:00:00.000Z",
  ...overrides,
});

function itineraryWithStop(item) {
  const it = { ...createItinerary("2026-11-23", "2026-11-23"), id: "it-1", name: "UK Trip" };
  it.days[0].items = [{ id: "s1", title: "Stop", type: "sight", time: "10:00", location: "", notes: "", ...item }];
  return it;
}

let fixtures;

beforeEach(async () => {
  fixtures = {
    "https://example.com/photo.png": { ok: true, bytes: makePng(2000, 1000) },
    "https://example.com/photo.jpg": { ok: true, bytes: makeJpeg(400, 300) },
    "https://example.com/doc-a.pdf": { ok: true, bytes: await makeDonorPdf(2) },
    "https://example.com/doc-b.pdf": { ok: true, bytes: await makeDonorPdf(1) },
    "https://example.com/missing.png": { ok: false, status: 404 },
  };
  global.fetch = jest.fn(async (url) => {
    if (url === "https://example.com/throws") throw new Error("network down");
    const fixture = fixtures[url];
    if (!fixture) throw new Error(`no fixture for ${url}`);
    if (!fixture.ok) return { ok: false, status: fixture.status };
    return { ok: true, arrayBuffer: async () => fixture.bytes };
  });
  jest.spyOn(console, "error").mockImplementation(() => {});

  // jsdom doesn't implement URL.createObjectURL/revokeObjectURL. Capture whatever bytes
  // `downloadBytes` wraps in a Blob directly, rather than depending on jsdom's Blob support.
  global.URL.createObjectURL = jest.fn(() => "blob:mock");
  global.URL.revokeObjectURL = jest.fn();
  global.downloadedBytes = null;
  const OrigBlob = global.Blob;
  jest.spyOn(global, "Blob").mockImplementation((parts, opts) => {
    global.downloadedBytes = parts[0];
    return new OrigBlob(parts, opts);
  });
});

afterEach(() => {
  console.error.mockRestore();
  global.Blob.mockRestore();
});

// --- classifyAttachment / getImageDimensions -------------------------------

describe("classifyAttachment", () => {
  test("classifies any image type as 'image' (embeddable formats are decided separately), PDFs as 'pdf'", () => {
    expect(classifyAttachment(attachment({ contentType: "image/png" }))).toBe("image");
    expect(classifyAttachment(attachment({ contentType: "image/jpeg" }))).toBe("image");
    // not natively embeddable, but still routed to the inline path so it gets a fallback note
    expect(classifyAttachment(attachment({ contentType: "image/heic" }))).toBe("image");
    expect(classifyAttachment(attachment({ contentType: "image/webp" }))).toBe("image");
    expect(classifyAttachment(attachment({ contentType: "application/pdf" }))).toBe("pdf");
  });

  test("classifies anything else as 'unsupported' (left out of the PDF entirely)", () => {
    expect(classifyAttachment(attachment({ contentType: "application/octet-stream" }))).toBe("unsupported");
    expect(classifyAttachment(attachment({ contentType: undefined }))).toBe("unsupported");
  });
});

describe("getImageDimensions", () => {
  test("reads width/height from PNG and JPEG headers", () => {
    expect(getImageDimensions(makePng(120, 80), "image/png")).toEqual({ width: 120, height: 80 });
    expect(getImageDimensions(makeJpeg(400, 300), "image/jpeg")).toEqual({ width: 400, height: 300 });
  });

  test("returns null for unreadable input", () => {
    expect(getImageDimensions(new Uint8Array([1, 2]), "image/png")).toBeNull();
    expect(getImageDimensions(makePng(1, 1), "image/webp")).toBeNull();
  });
});

// --- Inline images ----------------------------------------------------------

describe("inline images", () => {
  test("embeds a supported image inline, scaled to fit, without naming it in the body", async () => {
    await exportItineraryToPdf(
      itineraryWithStop({ attachments: [attachment({ name: "view.png", url: "https://example.com/photo.png", contentType: "image/png" })] })
    );
    expect(mockCalls.images).toHaveLength(1);
    const img = mockCalls.images[0];
    expect(img.format).toBe("PNG");
    // source is 2000x1000 (2:1) - height should be capped at 180, width scaled to match
    expect(img.h).toBeCloseTo(180, 5);
    expect(img.w).toBeCloseTo(360, 5);
    expect(mockCalls.text.some((t) => t.includes("view.png"))).toBe(false);
  });

  test("falls back to a text note for an unsupported image format", async () => {
    await exportItineraryToPdf(
      itineraryWithStop({ attachments: [attachment({ name: "photo.heic", contentType: "image/heic" })] })
    );
    expect(mockCalls.images).toHaveLength(0);
    expect(mockCalls.text.some((t) => t.includes("photo.heic") && t.includes("preview not available"))).toBe(true);
  });

  test("falls back to a text note when the image can't be fetched, without failing the export", async () => {
    await exportItineraryToPdf(
      itineraryWithStop({
        attachments: [attachment({ name: "gone.png", url: "https://example.com/missing.png", contentType: "image/png" })],
      })
    );
    expect(mockCalls.images).toHaveLength(0);
    expect(mockCalls.text.some((t) => t.includes("gone.png") && t.includes("couldn't be loaded"))).toBe(true);
  });
});

// --- PDF appendix -------------------------------------------------------------

describe("PDF appendix", () => {
  test("takes the fast path (no pdf-lib merge) when there are no PDF attachments", async () => {
    await exportItineraryToPdf(itineraryWithStop({ attachments: [] }));
    expect(mockCalls.save).toBe("UK_Trip.pdf");
  });

  test("references a PDF attachment inline and merges its pages onto the end", async () => {
    await exportItineraryToPdf(
      itineraryWithStop({
        attachments: [attachment({ name: "boarding-pass.pdf", url: "https://example.com/doc-a.pdf", contentType: "application/pdf" })],
      })
    );
    expect(mockCalls.text.some((t) => t.includes("boarding-pass.pdf") && t.includes("see Appendix A1"))).toBe(true);
    // no jsPDF-level save when there IS an appendix - pdf-lib produces and downloads the final file
    expect(mockCalls.save).toBeNull();
  });

  test("numbers references sequentially across stops and merges every attached PDF's pages", async () => {
    const it = { ...createItinerary("2026-11-23", "2026-11-24"), id: "it-1", name: "UK Trip" };
    it.days[0].items = [
      { id: "s1", title: "Flight", type: "flight", time: "07:30", location: "", notes: "", attachments: [attachment({ name: "a.pdf", url: "https://example.com/doc-a.pdf", contentType: "application/pdf" })] },
    ];
    it.days[1].items = [
      { id: "s2", title: "Hotel", type: "stay", time: "14:00", location: "", notes: "", attachments: [attachment({ name: "b.pdf", url: "https://example.com/doc-b.pdf", contentType: "application/pdf" })] },
    ];

    await exportItineraryToPdf(it);

    expect(mockCalls.text.some((t) => t.includes("a.pdf") && t.includes("see Appendix A1"))).toBe(true);
    expect(mockCalls.text.some((t) => t.includes("b.pdf") && t.includes("see Appendix A2"))).toBe(true);

    // 1 placeholder "main" page + 1 appendix index page + 2 pages from doc-a + 1 page from doc-b
    const finalDoc = await PDFDocument.load(global.downloadedBytes);
    expect(finalDoc.getPageCount()).toBe(1 + 1 + 2 + 1);
  });

  test("marks an unmergeable PDF as unavailable instead of failing the whole export", async () => {
    await expect(
      exportItineraryToPdf(
        itineraryWithStop({
          attachments: [attachment({ name: "broken.pdf", url: "https://example.com/throws", contentType: "application/pdf" })],
        })
      )
    ).resolves.toBeUndefined();

    expect(mockCalls.text.some((t) => t.includes("broken.pdf") && t.includes("see Appendix A1"))).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});

// --- Filename sanitization (unchanged behaviour) ---------------------------

describe("sanitizeFilename", () => {
  test("replaces unsafe characters and collapses runs of them", () => {
    expect(sanitizeFilename("UK Trip: Nov/Dec 2026")).toBe("UK_Trip_Nov_Dec_2026");
  });

  test("falls back to 'itinerary' for empty, missing or punctuation-only names", () => {
    expect(sanitizeFilename("")).toBe("itinerary");
    expect(sanitizeFilename(undefined)).toBe("itinerary");
    expect(sanitizeFilename("!!!")).toBe("itinerary");
  });

  test("caps the length", () => {
    expect(sanitizeFilename("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
