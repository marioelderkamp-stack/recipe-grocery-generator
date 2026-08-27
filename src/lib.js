// Pure, framework-free helpers shared by App.jsx — kept dependency-free so
// they're directly unit-testable without a DOM/React environment.

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

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

// Voorraad: self-tuning restock reminders. Each opted-in ingredient gets a
// simple cadence category; isRestockDue compares actual weeks-since-bought
// against that category's threshold, refined by a learned average interval
// (see markIngredientBought in api.js) so a fixed bucket like "elke maand"
// gradually converges toward how often the household actually buys it.
export const RESTOCK_CATEGORIES = [
  { id: "wekelijks", label: "Elke week", thresholdWeeks: 1 },
  { id: "maandelijks", label: "Elke maand", thresholdWeeks: 4 },
  { id: "per_paar_maanden", label: "Om de paar maanden", thresholdWeeks: 10 },
  { id: "zelden", label: "Zelden", thresholdWeeks: 26 },
];

export function weeksBetween(weekStartA, weekStartB) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((new Date(weekStartA) - new Date(weekStartB)) / msPerWeek);
}

// Lead time so a gradually-depleting item (e.g. aluminiumfolie) gets
// suggested before the household actually runs out, not after. The learned
// threshold is clamped to 0.4x-1.5x the category's own threshold so a thin
// history (or a single early outlier) can't drift the estimate far from
// what the chosen category still promises.
const RESTOCK_LEAD_TIME_WEEKS = 2;

// Store-availability status, cycled by tapping a badge in IngredientManager
// (and reused by VoorraadTab when assigning a store to a freshly-added item).
export const STORE_STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
export const nextStoreStatus = (current) => STORE_STATUS_CYCLE[(STORE_STATUS_CYCLE.indexOf(current) + 1) % STORE_STATUS_CYCLE.length];

export function isRestockDue(category, restockState, viewedWeekStart) {
  const def = RESTOCK_CATEGORIES.find((c) => c.id === category);
  if (!def) return true;
  const { lastBoughtWeek, avgIntervalWeeks } = restockState || {};
  const weeksSince = weeksBetween(viewedWeekStart, lastBoughtWeek);
  let threshold = def.thresholdWeeks;
  if (avgIntervalWeeks != null) {
    const learned = avgIntervalWeeks - RESTOCK_LEAD_TIME_WEEKS;
    threshold = Math.min(Math.max(learned, def.thresholdWeeks * 0.4), def.thresholdWeeks * 1.5);
  }
  return weeksSince >= threshold;
}
