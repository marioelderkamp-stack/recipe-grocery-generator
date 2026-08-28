import { describe, it, expect } from "vitest";
import {
  dstr,
  startOfWeek,
  addDays,
  isCookDay,
  isScheduledCookDay,
  isOptionalCookDay,
  anchorIdxFor,
  tagColor,
  assignStore,
  isRegular,
  weeksBetween,
  isRecurringDue,
  parseQuantity,
  aggregateQuantities,
  aisleRank,
  compareByAisle,
} from "./lib.js";

describe("date helpers", () => {
  it("dstr formats as YYYY-MM-DD", () => {
    expect(dstr(new Date("2026-08-25T14:00:00Z"))).toBe("2026-08-25");
  });

  it("startOfWeek returns the preceding Sunday at midnight", () => {
    // Wednesday 26 Aug 2026 -> Sunday 23 Aug 2026
    const wed = new Date(2026, 7, 26, 15, 30);
    const sun = startOfWeek(wed);
    expect(sun.getDay()).toBe(0);
    expect(sun.getDate()).toBe(23);
    expect(sun.getHours()).toBe(0);
    expect(sun.getMinutes()).toBe(0);
  });

  it("startOfWeek on a Sunday returns that same day at midnight", () => {
    const sun = new Date(2026, 7, 23, 9, 0);
    const result = startOfWeek(sun);
    expect(result.getDate()).toBe(23);
    expect(result.getHours()).toBe(0);
  });

  it("addDays crosses month boundaries correctly", () => {
    const aug30 = new Date(2026, 7, 30);
    const result = addDays(aug30, 3);
    expect(result.getMonth()).toBe(8); // September (0-indexed)
    expect(result.getDate()).toBe(2);
  });

  it("addDays supports negative offsets", () => {
    const sep2 = new Date(2026, 8, 2);
    const result = addDays(sep2, -3);
    expect(result.getMonth()).toBe(7); // August
    expect(result.getDate()).toBe(30);
  });
});

describe("cook-day scheduling (zo+ma / di+wo / do+vr, za optional)", () => {
  it("marks zo, di, do as scheduled cook days", () => {
    expect(isScheduledCookDay(0)).toBe(true); // zo
    expect(isScheduledCookDay(2)).toBe(true); // di
    expect(isScheduledCookDay(4)).toBe(true); // do
  });

  it("does not mark ma, wo, vr as scheduled cook days", () => {
    expect(isScheduledCookDay(1)).toBe(false); // ma
    expect(isScheduledCookDay(3)).toBe(false); // wo
    expect(isScheduledCookDay(5)).toBe(false); // vr
  });

  it("marks za as optional, not scheduled", () => {
    expect(isScheduledCookDay(6)).toBe(false);
    expect(isOptionalCookDay(6)).toBe(true);
  });

  it("isCookDay is true for scheduled and optional days", () => {
    expect(isCookDay(0)).toBe(true); // zo, scheduled
    expect(isCookDay(6)).toBe(true); // za, optional
    expect(isCookDay(1)).toBe(false); // ma, restjesdag
  });

  it("anchorIdxFor resolves a restjesdag back to its cook day", () => {
    expect(anchorIdxFor(1)).toBe(0); // ma -> zo
    expect(anchorIdxFor(3)).toBe(2); // wo -> di
    expect(anchorIdxFor(5)).toBe(4); // vr -> do
  });

  it("anchorIdxFor returns the day itself for a cook day", () => {
    expect(anchorIdxFor(0)).toBe(0); // zo
    expect(anchorIdxFor(2)).toBe(2); // di
    expect(anchorIdxFor(4)).toBe(4); // do
    expect(anchorIdxFor(6)).toBe(6); // za (optional, own anchor)
  });
});

describe("tagColor", () => {
  it("maps vlees to rust", () => {
    expect(tagColor("vlees")).toBe("#A75135");
  });

  it("maps vis to blue", () => {
    expect(tagColor("vis")).toBe("#4C7A9E");
  });

  it("defaults everything else (veg) to sage", () => {
    expect(tagColor("veg")).toBe("#5C7A5E");
    expect(tagColor("anything-else")).toBe("#5C7A5E");
  });
});

describe("assignStore", () => {
  it("bio mode: Lidl bio wins when everything is bio", () => {
    const a = { lidl: "bio", ah: "bio", ekoplaza: "bio" };
    expect(assignStore(a, "bio")).toEqual({ store: "lidl", bio: true });
  });

  it("trips mode: Lidl still wins when everything is bio (first store that has it)", () => {
    const a = { lidl: "bio", ah: "bio", ekoplaza: "bio" };
    expect(assignStore(a, "trips")).toEqual({ store: "lidl", bio: true });
  });

  it("bio mode: picks AH bio when Lidl isn't bio there (e.g. gemengde sla)", () => {
    const a = { lidl: "non_bio_only", ah: "bio", ekoplaza: "bio" };
    expect(assignStore(a, "bio")).toEqual({ store: "ah", bio: true });
  });

  it("trips mode: picks Lidl non-bio for the same item, minimizing stops", () => {
    const a = { lidl: "non_bio_only", ah: "bio", ekoplaza: "bio" };
    expect(assignStore(a, "trips")).toEqual({ store: "lidl", bio: false });
  });

  it("bio mode: falls through to Ekoplaza when neither Lidl nor AH has bio", () => {
    const a = { lidl: "non_bio_only", ah: "non_bio_only", ekoplaza: "bio" };
    expect(assignStore(a, "bio")).toEqual({ store: "ekoplaza", bio: true });
  });

  it("trips mode: still picks Lidl non-bio for the same item", () => {
    const a = { lidl: "non_bio_only", ah: "non_bio_only", ekoplaza: "bio" };
    expect(assignStore(a, "trips")).toEqual({ store: "lidl", bio: false });
  });

  it("both modes: an item only carried by Ekoplaza always lands there", () => {
    const a = { lidl: "not_available", ah: "not_available", ekoplaza: "bio" };
    expect(assignStore(a, "bio")).toEqual({ store: "ekoplaza", bio: true });
    expect(assignStore(a, "trips")).toEqual({ store: "ekoplaza", bio: true });
  });

  it("bio mode: with no bio anywhere, falls back to the nearest non-bio store", () => {
    const a = { lidl: "non_bio_only", ah: "non_bio_only", ekoplaza: "not_available" };
    expect(assignStore(a, "bio")).toEqual({ store: "lidl", bio: false });
  });

  it("both modes: unassigned when genuinely not available anywhere", () => {
    const a = { lidl: "not_available", ah: "not_available", ekoplaza: "not_available" };
    expect(assignStore(a, "bio")).toEqual({ store: null, bio: null });
    expect(assignStore(a, "trips")).toEqual({ store: null, bio: null });
  });

  it("both modes: unassigned when there's no availability data at all", () => {
    expect(assignStore(undefined, "bio")).toEqual({ store: null, bio: null });
    expect(assignStore(undefined, "trips")).toEqual({ store: null, bio: null });
  });
});

describe("isRegular", () => {
  it("is not a regular right at the threshold", () => {
    expect(isRegular(3)).toBe(false);
  });

  it("is a regular just above the threshold", () => {
    expect(isRegular(4)).toBe(true);
  });

  it("defaults to 1 (not a regular) when unset", () => {
    expect(isRegular(undefined)).toBe(false);
    expect(isRegular(null)).toBe(false);
  });

  it("a high value (e.g. olijfolie) is a regular", () => {
    expect(isRegular(10)).toBe(true);
  });
});

describe("weeksBetween", () => {
  it("counts whole weeks between two week-start dates", () => {
    expect(weeksBetween("2026-08-30", "2026-08-23")).toBe(1);
    expect(weeksBetween("2026-09-20", "2026-08-23")).toBe(4);
  });

  it("is zero for the same date", () => {
    expect(weeksBetween("2026-08-23", "2026-08-23")).toBe(0);
  });
});

describe("isRecurringDue", () => {
  it("is due immediately when never bought", () => {
    expect(isRecurringDue(4, null, "2026-08-23")).toBe(true);
  });

  it("is not due before the interval has elapsed", () => {
    expect(isRecurringDue(4, "2026-08-02", "2026-08-23")).toBe(false);
  });

  it("is due once the interval has elapsed", () => {
    expect(isRecurringDue(4, "2026-08-02", "2026-08-30")).toBe(true);
  });

  it("weekly (interval 1) is due the very next week", () => {
    expect(isRecurringDue(1, "2026-08-23", "2026-08-23")).toBe(false);
    expect(isRecurringDue(1, "2026-08-23", "2026-08-30")).toBe(true);
  });
});

describe("parseQuantity", () => {
  it("parses a whole gram amount", () => {
    expect(parseQuantity("900g")).toEqual({ amount: 900, unit: "g" });
  });

  it("parses a comma-decimal ml amount", () => {
    expect(parseQuantity("67,5ml")).toEqual({ amount: 67.5, unit: "ml" });
  });

  it("parses a count (st) amount", () => {
    expect(parseQuantity("3st")).toEqual({ amount: 3, unit: "st" });
  });

  it("rejects anything not in normalized <amount><unit> form", () => {
    expect(parseQuantity("3 tenen")).toBe(null);
    expect(parseQuantity("2,5 blik")).toBe(null);
    expect(parseQuantity("900kg")).toBe(null);
  });
});

describe("aggregateQuantities", () => {
  it("sums several recipes' worth of the same ingredient into one line", () => {
    expect(aggregateQuantities(["12g", "18g", "8g"])).toBe("38g");
  });

  it("names the unit once, not per recipe", () => {
    expect(aggregateQuantities(["30ml", "45ml"])).toBe("75ml");
  });

  it("keeps a comma-decimal result when the sum isn't whole", () => {
    expect(aggregateQuantities(["22,5ml", "45ml"])).toBe("67,5ml");
  });

  it("is a no-op for a single quantity", () => {
    expect(aggregateQuantities(["3st"])).toBe("3st");
  });

  it("returns an empty string for no quantities (e.g. a recurring item)", () => {
    expect(aggregateQuantities([])).toBe("");
  });

  it("falls back to joining raw strings when units genuinely differ", () => {
    expect(aggregateQuantities(["12g", "3st"])).toBe("12g + 3st");
  });

  it("falls back to joining raw strings when something doesn't parse", () => {
    expect(aggregateQuantities(["12g", "een snufje"])).toBe("12g + een snufje");
  });
});

describe("aisleRank", () => {
  it("orders the named aisles fruit through kaas_vlees_vis", () => {
    expect(aisleRank("fruit")).toBeLessThan(aisleRank("groente"));
    expect(aisleRank("groente")).toBeLessThan(aisleRank("brood"));
    expect(aisleRank("brood")).toBeLessThan(aisleRank("kruiden"));
    expect(aisleRank("kruiden")).toBeLessThan(aisleRank("noten"));
    expect(aisleRank("noten")).toBeLessThan(aisleRank("houdbaar"));
    expect(aisleRank("houdbaar")).toBeLessThan(aisleRank("kaas_vlees_vis"));
  });

  it("puts an uncategorized or unknown item last", () => {
    expect(aisleRank(undefined)).toBeGreaterThan(aisleRank("kaas_vlees_vis"));
    expect(aisleRank(null)).toBeGreaterThan(aisleRank("kaas_vlees_vis"));
    expect(aisleRank("something-unrecognized")).toBeGreaterThan(aisleRank("kaas_vlees_vis"));
  });
});

describe("compareByAisle", () => {
  it("sorts entries by aisle first, alphabetically within an aisle", () => {
    const aisleByName = { banaan: "fruit", appel: "fruit", ui: "groente", koffie: undefined };
    const entries = [["koffie", []], ["ui", []], ["banaan", []], ["appel", []]];
    entries.sort(compareByAisle(aisleByName));
    expect(entries.map(([name]) => name)).toEqual(["appel", "banaan", "ui", "koffie"]);
  });
});
