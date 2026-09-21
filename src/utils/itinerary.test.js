import {
  countOutside,
  createItinerary,
  deleteItem,
  getDateRange,
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
