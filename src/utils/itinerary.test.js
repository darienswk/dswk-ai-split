import {
  attachmentStoragePath,
  countOutside,
  createItinerary,
  deleteItem,
  getAllAttachments,
  getDateRange,
  getMapsLink,
  isImageAttachment,
  MAX_ITINERARY_DAYS,
  moveItemToDay,
  reorderWithinDay,
  resizeItinerary,
  saveItem,
} from "./itinerary";

const stop = (id) => ({ id, title: id, type: "sight", time: "", location: "", notes: "" });
const ids = (day) => day.items.map((i) => i.id);

function sample() {
  const it = createItinerary("2026-11-23", "2026-11-25");
  it.days[0].items = [stop("a"), stop("b"), stop("c")];
  it.days[1].items = [stop("d")];
  return it;
}

describe("getDateRange", () => {
  test("is inclusive and crosses month boundaries", () => {
    expect(getDateRange("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });

  test("covers the 23 Nov - 5 Dec 2026 trip in 13 days", () => {
    const dates = getDateRange("2026-11-23", "2026-12-05");
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe("2026-11-23");
    expect(dates[12]).toBe("2026-12-05");
  });

  test("rejects missing, reversed and over-long ranges", () => {
    expect(getDateRange("", "2026-12-05")).toEqual([]);
    expect(getDateRange("2026-12-05", "2026-11-23")).toEqual([]);
    expect(getDateRange("2026-01-01", "2027-12-31").length).toBe(0);
    expect(MAX_ITINERARY_DAYS).toBe(60);
  });
});

describe("resizeItinerary", () => {
  test("keeps existing days when extending the range", () => {
    const next = resizeItinerary(sample(), "2026-11-22", "2026-11-26");
    expect(next.days.map((d) => d.id)).toEqual([
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(ids(next.days[1])).toEqual(["a", "b", "c"]);
  });

  test("moves stops from dropped days to the nearest remaining day", () => {
    const it = sample();
    it.days[2].items = [stop("e")];
    expect(countOutside(it, "2026-11-24", "2026-11-24")).toBe(4);

    const next = resizeItinerary(it, "2026-11-24", "2026-11-24");
    expect(next.days).toHaveLength(1);
    expect(ids(next.days[0]).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("keeps the itinerary's own fields (id, name, ...) when resizing", () => {
    const it = { ...sample(), id: "it-1", name: "UK Trip", createdAt: "2026-09-21T00:00:00.000Z" };
    const next = resizeItinerary(it, "2026-11-23", "2026-11-30");
    expect(next).toMatchObject({ id: "it-1", name: "UK Trip", createdAt: it.createdAt });
    expect(next.days).toHaveLength(8);
  });

  test("returns the itinerary untouched for an invalid range", () => {
    const it = sample();
    expect(resizeItinerary(it, "2026-12-01", "2026-11-01")).toBe(it);
  });
});

describe("moveItemToDay", () => {
  test("moves into an empty day (dropped on the day itself)", () => {
    const days = moveItemToDay(sample().days, "a", "2026-11-25", false);
    expect(ids(days[0])).toEqual(["b", "c"]);
    expect(ids(days[2])).toEqual(["a"]);
  });

  test("inserts before or after the hovered stop", () => {
    expect(ids(moveItemToDay(sample().days, "a", "d", false)[1])).toEqual(["a", "d"]);
    expect(ids(moveItemToDay(sample().days, "a", "d", true)[1])).toEqual(["d", "a"]);
  });

  test("does nothing within the same day", () => {
    const days = sample().days;
    expect(moveItemToDay(days, "a", "b", true)).toBe(days);
  });
});

describe("reorderWithinDay", () => {
  test("reorders within a day", () => {
    const days = reorderWithinDay(sample().days, "a", "c");
    expect(ids(days[0])).toEqual(["b", "c", "a"]);
  });

  test("ignores drops across days or onto a day container", () => {
    const days = sample().days;
    expect(reorderWithinDay(days, "a", "d")).toBe(days);
    expect(reorderWithinDay(days, "a", "2026-11-23")).toBe(days);
  });
});

describe("saveItem / deleteItem", () => {
  test("adds a new stop to the chosen day", () => {
    const days = saveItem(sample().days, { ...stop("n"), dayId: "2026-11-25" }, null);
    expect(ids(days[2])).toEqual(["n"]);
    expect(days[2].items[0]).not.toHaveProperty("dayId");
  });

  test("edits in place, and moves when the day changes", () => {
    const original = sample().days;
    const edited = saveItem(original, { title: "Renamed", dayId: "2026-11-23" }, original[0].items[1]);
    expect(edited[0].items[1].title).toBe("Renamed");
    expect(ids(edited[0])).toEqual(["a", "b", "c"]);

    const moved = saveItem(original, { title: "b", dayId: "2026-11-24" }, original[0].items[1]);
    expect(ids(moved[0])).toEqual(["a", "c"]);
    expect(ids(moved[1])).toEqual(["d", "b"]);
  });

  test("deletes a stop", () => {
    expect(ids(deleteItem(sample().days, "b")[0])).toEqual(["a", "c"]);
  });
});

describe("getMapsLink", () => {
  test("turns a place name into an encoded Google Maps search link", () => {
    expect(getMapsLink("Tower of London, London EC3N 4AB")).toEqual({
      href: "https://www.google.com/maps/search/?api=1&query=Tower%20of%20London%2C%20London%20EC3N%204AB",
      label: "Tower of London, London EC3N 4AB",
      isUrl: false,
    });
  });

  test("encodes characters that could break out of the query", () => {
    expect(getMapsLink("Fish & Chips #1").href).toBe(
      "https://www.google.com/maps/search/?api=1&query=Fish%20%26%20Chips%20%231"
    );
  });

  test("uses a pasted web link as-is", () => {
    expect(getMapsLink("https://maps.app.goo.gl/abc123")).toEqual({
      href: "https://maps.app.goo.gl/abc123",
      label: "Open in Maps",
      isUrl: true,
    });
  });

  test("never links non-web URLs; they are treated as plain text", () => {
    const link = getMapsLink("javascript:alert(1)");
    expect(link.href.startsWith("https://www.google.com/maps/search/")).toBe(true);
    expect(link.isUrl).toBe(false);
  });

  test("returns null for an empty location", () => {
    expect(getMapsLink("")).toBeNull();
    expect(getMapsLink("   ")).toBeNull();
    expect(getMapsLink(undefined)).toBeNull();
  });
});

describe("attachmentStoragePath", () => {
  test("scopes the path under the user, itinerary and stop", () => {
    const path = attachmentStoragePath("u1", "it-1", "stop-1", "att-1", "boarding pass.pdf");
    expect(path).toBe("users/u1/itineraries/it-1/stop-1/att-1-boarding_pass.pdf");
  });

  test("sanitizes characters that aren't safe in a storage path", () => {
    const path = attachmentStoragePath("u1", "it-1", "stop-1", "att-1", "café/résumé? (final).pdf");
    expect(path).toBe("users/u1/itineraries/it-1/stop-1/att-1-caf_r_sum_final_.pdf");
  });

  test("falls back to a default name and caps the length", () => {
    expect(attachmentStoragePath("u1", "it-1", "stop-1", "att-1", "")).toBe(
      "users/u1/itineraries/it-1/stop-1/att-1-file"
    );
    const long = "a".repeat(200) + ".pdf";
    const path = attachmentStoragePath("u1", "it-1", "stop-1", "att-1", long);
    expect(path.length).toBeLessThan(long.length + 40);
  });
});

describe("isImageAttachment", () => {
  test("checks the stored content type", () => {
    expect(isImageAttachment({ contentType: "image/png" })).toBe(true);
    expect(isImageAttachment({ contentType: "application/pdf" })).toBe(false);
    expect(isImageAttachment({})).toBe(false);
  });
});

describe("getAllAttachments", () => {
  test("flattens attachments across every day and stop", () => {
    const it = createItinerary("2026-11-23", "2026-11-24");
    it.days[0].items = [
      { ...stop("a"), attachments: [{ id: "f1" }, { id: "f2" }] },
      { ...stop("b"), attachments: [] },
    ];
    it.days[1].items = [{ ...stop("c"), attachments: [{ id: "f3" }] }, stop("d")];
    expect(getAllAttachments(it).map((a) => a.id)).toEqual(["f1", "f2", "f3"]);
  });

  test("returns an empty array when there are no attachments", () => {
    expect(getAllAttachments(createItinerary("2026-11-23", "2026-11-24"))).toEqual([]);
  });
});
