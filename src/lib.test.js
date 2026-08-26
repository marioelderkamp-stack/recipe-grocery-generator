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
