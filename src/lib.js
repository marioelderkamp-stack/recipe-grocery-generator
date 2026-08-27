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

export const STORE_META = {
  lidl: {
    name: "Lidl", tint: "rgba(201,154,58,0.16)", border: "#846526",
    labelBg: "rgba(201,154,58,0.55)", shopBtnBg: "#F0C230", shopBtnColor: "#16233D",
  },
  ah: {
    name: "Albert Heijn", tint: "rgba(76,122,158,0.14)", border: "#4C7A9E",
    labelBg: "rgba(76,122,158,0.5)", shopBtnBg: "#4C7A9E", shopBtnColor: "#FFFFFF",
  },
  ekoplaza: {
    name: "Ekoplaza", tint: "rgba(139,95,166,0.14)", border: "#8B5FA6",
    labelBg: "rgba(139,95,166,0.5)", shopBtnBg: "#8B5FA6", shopBtnColor: "#FFFFFF",
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
