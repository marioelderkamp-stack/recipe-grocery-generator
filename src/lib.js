// Pure, framework-free helpers shared by App.jsx — kept dependency-free so
// they're directly unit-testable without a DOM/React environment.

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export const TAGS = [
  { id: "veg", label: "Vegetarisch", color: "#5C7A5E" },
  { id: "vlees", label: "Vlees", color: "#A75135" },
  { id: "vis", label: "Vis", color: "#4C7A9E" },
];

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
const QUANTITY_RE = /^([0-9]+(?:,[0-9]+)?)(g|ml|st)$/;

export function parseQuantity(qty) {
  const m = QUANTITY_RE.exec(qty.trim());
  if (!m) return null;
  return { amount: parseFloat(m[1].replace(",", ".")), unit: m[2] };
}

function formatAmount(amount) {
  const rounded = Math.round(amount * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

// Sums an ingredient's quantities (one per recipe using it this week) into a
// single "<total><unit>" line, so the unit is named once instead of once per
// recipe. Falls back to joining the raw strings when something doesn't parse
// or units genuinely differ, so an entry never silently disappears.
export function aggregateQuantities(qtys) {
  if (qtys.length === 0) return "";
  const parsed = qtys.map(parseQuantity);
  const unit = parsed[0]?.unit;
  if (parsed.some((p) => !p || p.unit !== unit)) return qtys.join(" + ");
  const total = parsed.reduce((sum, p) => sum + p.amount, 0);
  return formatAmount(total) + unit;
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
