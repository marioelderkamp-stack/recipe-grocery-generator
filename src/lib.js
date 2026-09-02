// Pure, framework-free helpers shared by App.jsx — kept dependency-free so
// they're directly unit-testable without a DOM/React environment.

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export const RECIPE_NAME_MAX_LENGTH = 30;

export const dstr = (d) => d.toISOString().slice(0, 10);
export const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const startOfWeek = (d) => { const x = new Date(d); const diff = x.getDay(); x.setDate(x.getDate() - diff); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Kookdagen (index in weekDates, waarbij 0=zo): setjes van 2 dagen, gekookt op de
// eerste dag van elk setje — zo+ma, di+wo, do+vr. Zaterdag doet niet mee aan het
// automatisch invullen, maar kan wel los en handmatig gevuld worden.
export const COOK_DAYS = { 0: 2, 2: 2, 4: 2 };
export const OPTIONAL_DAYS = { 6: 1 };
export const isScheduledCookDay = (i) => Object.prototype.hasOwnProperty.call(COOK_DAYS, i);
export const isOptionalCookDay = (i) => Object.prototype.hasOwnProperty.call(OPTIONAL_DAYS, i);
export const isCookDay = (i) => isScheduledCookDay(i) || isOptionalCookDay(i);
export const anchorIdxFor = (i) => (isCookDay(i) ? i : i - 1);

// This household eats about EVENING_PERSONS per evening — a scheduled cook
// day (zo/di/do) covers two evenings by default (itself plus its tweede
// dag, sharing one batch — COOK_DAYS' own value above), so its default
// "aantal personen" is double that. Everything else that can independently
// need its own ingredients — the optional zaterdag, or a tweede dag once
// it's been pointed at a different recipe than its cook day's — covers
// just the one evening it's actually for.
export const EVENING_PERSONS = 3;
export const defaultPersonsForDay = (i) => (COOK_DAYS[i] ?? 1) * EVENING_PERSONS;

export function tagColor(tag) {
  if (tag === "vlees") return "#A75135";
  if (tag === "vis") return "#4C7A9E";
  return "#5C7A5E";
}

// Prioriteit voor assignStore hieronder: Lidl > AH > Ekoplaza (minste ritjes
// als bio nergens beschikbaar is). Los van de volgorde waarin de secties
// getoond worden in de boodschappenlijst — zie STORE_DISPLAY_ORDER.
export const STORE_ORDER = ["lidl", "ah", "ekoplaza"];

// Volgorde van de winkelsecties in de boodschappenlijst-weergave.
export const STORE_DISPLAY_ORDER = ["ekoplaza", "ah", "lidl"];

// shopBtnBg/shopBtnColor on lidl/ah/ekoplaza are each brand's own real logo
// colors (Lidl: fluorescent yellow + French blue; Albert Heijn: their sky
// blue + white; Ekoplaza: the deep purple from their logo + white) so the
// "Afstreeplijstje" button reads as that store's own colors, not ours.
export const STORE_META = {
  lidl: {
    name: "Lidl", tint: "rgba(201,154,58,0.16)", border: "#846526",
    labelBg: "rgba(201,154,58,0.55)", shopBtnBg: "#FFF200", shopBtnColor: "#015AA2",
  },
  ah: {
    name: "Albert Heijn", tint: "rgba(76,122,158,0.14)", border: "#4C7A9E",
    labelBg: "rgba(76,122,158,0.5)", shopBtnBg: "#179EDA", shopBtnColor: "#FFFFFF",
  },
  ekoplaza: {
    name: "Ekoplaza", tint: "rgba(139,95,166,0.14)", border: "#8B5FA6",
    labelBg: "rgba(139,95,166,0.5)", shopBtnBg: "#581B5E", shopBtnColor: "#FFFFFF",
  },
  other: { name: "Onbekend", tint: "#EDEAE0", border: "#C9C2AE" },
};

// "bio": bio heeft voorrang boven winkelvolgorde — eerste winkel (Lidl > AH >
// Ekoplaza) die het bio heeft, en pas als nergens bio is de dichtstbijzijnde
// niet-bio optie. "trips": winkelvolgorde heeft voorrang boven bio — de eerste
// winkel die het product sowieso heeft (bio of niet-bio) wordt gebruikt.
export function assignStore(a, mode) {
  if (!a) return { store: null, bio: null };
  if (mode === "trips") {
    for (const s of STORE_ORDER) {
      if (a[s] === "bio") return { store: s, bio: true };
      if (a[s] === "non_bio_only") return { store: s, bio: false };
    }
    return { store: null, bio: null };
  }
  for (const s of STORE_ORDER) {
    if (a[s] === "bio") return { store: s, bio: true };
  }
  for (const s of STORE_ORDER) {
    if (a[s] === "non_bio_only") return { store: s, bio: false };
  }
  return { store: null, bio: null };
}

// Recipe ingredients are never excluded from the list — but a "regular"
// (salt, soy sauce, olive oil: something one purchase covers many recipes'
// worth of) is presumed already in stock and starts crossed off, unlike an
// ingredient bought fresh for this specific dish. recipesPerUnit is how many
// recipe-uses a typical purchase of this ingredient covers.
export const REGULAR_THRESHOLD = 3;
export const isRegular = (recipesPerUnit) => (recipesPerUnit ?? 1) > REGULAR_THRESHOLD;

// Every stored quantity is normalized to "<amount><unit>" (comma decimals,
// no space, exactly one of g / ml / st) — el/tl/kg/L/blik/bos-style units
// were folded into these at the data layer so a grocery-list line can sum
// several recipes' worth of the same ingredient instead of just listing
// each recipe's raw string next to the others.
//
// A recipe's ingredient amounts are stored PER PERSON. DEFAULT_PERSONS (6)
// is both the app's original/reference batch size — what Recepten beheren
// shows and edits, so authoring a recipe still means "for 6 people" — and
// the default headcount for a planned day that hasn't had its own "aantal
// personen" set.
export const DEFAULT_PERSONS = 6;

const QUANTITY_RE = /^([0-9]+(?:,[0-9]+)?)(g|ml|st)$/;

export function parseQuantity(qty) {
  const m = QUANTITY_RE.exec(qty.trim());
  if (!m) return null;
  return { amount: parseFloat(m[1].replace(",", ".")), unit: m[2] };
}

function formatFixed(amount, decimals) {
  const factor = 10 ** decimals;
  const rounded = Math.round(amount * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

// Recepten beheren / the recipe form always shows and edits amounts "voor 6
// personen" (the familiar reference batch) — these convert to/from what's
// actually stored. 4 decimals of headroom on the way down so an amount that
// doesn't divide evenly by 6 (e.g. 340g) round-trips back to the original
// through toReferenceSix instead of drifting.
export function toPerPerson(qtyForSix) {
  const parsed = parseQuantity(qtyForSix);
  if (!parsed) return qtyForSix;
  return formatFixed(parsed.amount / DEFAULT_PERSONS, 4) + parsed.unit;
}

export function toReferenceSix(qtyPerPerson) {
  const parsed = parseQuantity(qtyPerPerson);
  if (!parsed) return qtyPerPerson;
  return formatFixed(parsed.amount * DEFAULT_PERSONS, 1) + parsed.unit;
}

// Scales a per-person amount to a specific day's headcount. An intermediate
// value meant to be summed with other days' contributions to the same
// ingredient (see aggregateQuantities) — not shown directly, since the
// *shopping* rounding (round to something you'd actually buy) happens once,
// on the total, not per contributing day.
export function scaleQuantity(qtyPerPerson, persons) {
  const parsed = parseQuantity(qtyPerPerson);
  if (!parsed) return qtyPerPerson;
  return formatFixed(parsed.amount * persons, 3) + parsed.unit;
}

// Rounds a raw amount to something you'd actually buy: g/ml round to the
// nearest 25 from 100 up, nearest 5 below that; st rounds to the nearest
// whole item. Never rounds a genuinely positive amount away to 0.
function roundForShopping(amount, unit) {
  if (amount <= 0) return 0;
  if (unit === "st") return Math.max(1, Math.round(amount));
  const step = amount >= 100 ? 25 : 5;
  return Math.max(step, Math.round(amount / step) * step);
}

// Scales AND rounds a single recipe's ingredient to one day's headcount —
// for a single day's own ingredient preview (Gerechten), where there's
// nothing else to sum it with first.
export function scaleQuantityForShopping(qtyPerPerson, persons) {
  const parsed = parseQuantity(qtyPerPerson);
  if (!parsed) return qtyPerPerson;
  return String(roundForShopping(parsed.amount * persons, parsed.unit)) + parsed.unit;
}

// Sums an ingredient's quantities (one already-scaled contribution per cook
// day using it this week) into a single "<total><unit>" shopping amount, so
// the unit is named once and rounded once instead of per contributing day.
// Falls back to joining the raw strings when something doesn't parse or
// units genuinely differ, so an entry never silently disappears.
export function aggregateQuantities(qtys) {
  if (qtys.length === 0) return "";
  const parsed = qtys.map(parseQuantity);
  const unit = parsed[0]?.unit;
  if (parsed.some((p) => !p || p.unit !== unit)) return qtys.join(" + ");
  const total = parsed.reduce((sum, p) => sum + p.amount, 0);
  return String(roundForShopping(total, unit)) + unit;
}

export function weeksBetween(weekStartA, weekStartB) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((new Date(weekStartA) - new Date(weekStartB)) / msPerWeek);
}

// Household staples (boter, koffie, wc papier...) bought on a fixed cadence
// regardless of whether any recipe calls for them this week. Never bought
// yet ("lastBoughtWeek" null) counts as due immediately; otherwise due once
// enough weeks have passed since it was last checked off.
export function isRecurringDue(intervalWeeks, lastBoughtWeek, viewedWeekStart) {
  if (!lastBoughtWeek) return true;
  return weeksBetween(viewedWeekStart, lastBoughtWeek) >= intervalWeeks;
}

// Picks a random recipe, preferring ones not in avoidIds (recently cooked, or
// already picked elsewhere this week) — falls back to the full list if that
// preference would leave nothing to choose from. Shared by "Maak weekplan"
// (whole-week shuffle) and each cook day's own single-day reroll.
export function pickRandomRecipe(recipes, avoidIds) {
  let candidates = recipes.filter((r) => !avoidIds.has(r.id));
  if (candidates.length === 0) candidates = recipes;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Default grocery-list order, following a typical Lidl walk: fresh produce
// first, then bread, then the spice/nuts/pantry aisles, then the cheese and
// meat/fish counter. Anything without a category (dairy, frozen, household
// items — categories the user didn't ask to be ordered) sorts after all of
// these, alphabetically among themselves like everything did before this.
export const AISLE_ORDER = ["fruit", "groente", "brood", "kruiden", "noten", "houdbaar", "kaas_vlees_vis"];

export const AISLE_LABELS = {
  fruit: "Fruit", groente: "Groente", brood: "Brood", kruiden: "Kruiden",
  noten: "Noten", houdbaar: "Houdbaar", kaas_vlees_vis: "Kaas/vlees/vis",
};

export function aisleRank(category) {
  const idx = AISLE_ORDER.indexOf(category);
  return idx === -1 ? AISLE_ORDER.length : idx;
}

// A [name, ...] entry comparator (matches the tuple shape grocery lists are
// built from) — sorts by aisle first, then alphabetically within an aisle.
export function compareByAisle(aisleByName) {
  return ([a], [b]) => {
    const diff = aisleRank(aisleByName[a]) - aisleRank(aisleByName[b]);
    return diff !== 0 ? diff : a.localeCompare(b);
  };
}
