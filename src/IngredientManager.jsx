import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Trash2, Leaf, Pencil, Check, Filter, X } from "lucide-react";
import { STORE_ORDER, STORE_META, REGULAR_THRESHOLD, AISLE_ORDER, AISLE_LABELS, isRegular } from "./lib.js";
import { fetchIngredientsData, createIngredient, renameIngredient, mergeIngredient, deleteIngredient, setIngredientAvailability, setIngredientRecipesPerUnit, setIngredientAisleCategory, upsertRecurringItem, removeRecurringItem } from "./api.js";
import { inputStyle, generateBtnStyle, navBtnStyle, labelStyle } from "./styles.js";
import Modal from "./Modal.jsx";

const SHORT_LABEL = { lidl: "L", ah: "AH", ekoplaza: "E" };
const STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
const nextStatus = (current) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];

// Every filterable store status, including "any" (no constraint) — shared by
// the filter popup's per-store selects and its active-filter count.
const STORE_STATUS_LABELS = { any: "Alle", bio: "Bio", non_bio_only: "Niet-bio", not_available: "Niet verkrijgbaar" };

// One "no filter applied" value per filterable property — reused both as the
// popup's initial state and as what "Wis filters" resets back to.
const DEFAULT_FILTERS = {
  stores: { lidl: "any", ah: "any", ekoplaza: "any" },
  aisle: "any",
  regularity: "any",
  recurring: "any",
  usage: "any",
};

// Filter popup, opened from the button next to the search bar — the search
// bar covers the name, this covers every other ingredient property. Reuses
// the generic Modal shell like the merge/delete confirmations below.
function IngredientFilterModal({ filters, onChange, onClose }) {
  const update = (patch) => onChange({ ...filters, ...patch });
  const updateStore = (storeId, value) => onChange({ ...filters, stores: { ...filters.stores, [storeId]: value } });

  return (
    <Modal onClose={onClose}>
      <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: 0 }}>Filteren</h3>
          <button onClick={onClose} aria-label="Filter sluiten" style={{ background: "none", border: "none", cursor: "pointer", color: "#6E6A59", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <label style={labelStyle}>Winkels</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {STORE_ORDER.map((storeId) => (
            <div key={storeId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "#4A4E42", width: 84, flexShrink: 0 }}>{STORE_META[storeId].name}</span>
              <select
                value={filters.stores[storeId]}
                onChange={(e) => updateStore(storeId, e.target.value)}
                aria-label={`Filter op ${STORE_META[storeId].name}`}
                style={{ ...inputStyle, marginTop: 0, flex: 1 }}
              >
                {Object.entries(STORE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <label style={labelStyle}>Schap</label>
        <select
          value={filters.aisle}
          onChange={(e) => update({ aisle: e.target.value })}
          aria-label="Filter op schap"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 14 }}
        >
          <option value="any">Alle</option>
          <option value="none">— (maakt niet uit)</option>
          {AISLE_ORDER.map((cat, i) => (
            <option key={cat} value={cat}>{i + 1}. {AISLE_LABELS[cat]}</option>
          ))}
        </select>

        <label style={labelStyle}>Per aankoop</label>
        <select
          value={filters.regularity}
          onChange={(e) => update({ regularity: e.target.value })}
          aria-label="Filter op per aankoop"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 14 }}
        >
          <option value="any">Alle</option>
          <option value="regular">Regulier</option>
          <option value="staple">{`Vaste voorraad (boven de ${REGULAR_THRESHOLD})`}</option>
        </select>

        <label style={labelStyle}>Weken (terugkerend)</label>
        <select
          value={filters.recurring}
          onChange={(e) => update({ recurring: e.target.value })}
          aria-label="Filter op terugkerend"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 14 }}
        >
          <option value="any">Alle</option>
          <option value="yes">Terugkerend</option>
          <option value="no">Niet terugkerend</option>
        </select>

        <label style={labelStyle}>Gebruik</label>
        <select
          value={filters.usage}
          onChange={(e) => update({ usage: e.target.value })}
          aria-label="Filter op gebruik in recepten"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 18 }}
        >
          <option value="any">Alle</option>
          <option value="used">Gebruikt in recepten</option>
          <option value="unused">Ongebruikt</option>
        </select>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...generateBtnStyle, flex: 1 }}>
            Toepassen
          </button>
          <button onClick={() => onChange(DEFAULT_FILTERS)} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
            Wis filters
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Shared with the header row so its labels line up with what each row actually renders.
const COL_WIDTH = { pencil: 23, usage: 24 };

const columnHeaderStyle = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 11.4, fontWeight: 600, lineHeight: 1.25,
  color: "#5C5F52", textAlign: "center",
};

// Column specs for whatever a row renders after Naam, one set per tab —
// shared between the header's caption row and IngredientRow's fields below,
// so a caption's flex share always matches its field's, keeping Winkels
// (or Schap/Per aankoop/Weken) lined up directly under its own tab and
// caption instead of drifting off toward the row's far right edge.
const BESCHIKBAARHEID_COLUMNS = STORE_ORDER.map((storeId) => ({ key: storeId, label: STORE_META[storeId].name, flex: 1 }));
const AANVULLEND_COLUMNS = [
  { key: "aisle", label: "Schap", flex: 2 },
  { key: "rpu", label: "Aank.", flex: 1 },
  { key: "recurring", label: "Weken", flex: 1 },
];
const PROPS_TAB_COLUMNS = { beschikbaarheid: BESCHIKBAARHEID_COLUMNS, aanvullend: AANVULLEND_COLUMNS };
const PROPS_TABS = [["beschikbaarheid", "Beschikbaarheid"], ["aanvullend", "Aanvullende info"]];

// Gebr./pencil/Naam stay fixed on the left; Beschikbaarheid/Aanvullende info
// live in the right half as a segmented toggle (replacing the old full-width
// underline tabs), with a caption row underneath naming whichever tab's
// columns are showing (Lidl/AH/Ekoplaza, or Schap/Per aankoop/Weken) — see
// PROPS_TAB_COLUMNS, which IngredientRow's own tab switch below also reads
// from, so a row's data always lines up under these captions. This replaces
// the old per-column (i) popovers entirely: nothing here needs a tap to
// understand, and nothing floats over the rows scrolling underneath. Sticky
// + an opaque background keeps the whole block reachable while they scroll.
function IngredientColumnHeader({ tab, onTabChange }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1, background: "#EEEBE2", paddingBottom: 8, borderBottom: "1px solid #C9C2AE" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 50%", minWidth: 0 }}>
          <span style={{ ...columnHeaderStyle, width: COL_WIDTH.usage, flexShrink: 0 }}>Gebr.</span>
          <span style={{ width: COL_WIDTH.pencil, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ ...columnHeaderStyle, flex: 1, minWidth: 0, textAlign: "left" }}>Naam</span>
        </div>
        <div style={{ display: "flex", gap: 3, flex: "1 1 50%", minWidth: 0, background: "#E1DCC9", borderRadius: 8, padding: 3 }}>
          {PROPS_TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              // Without this, tapping a tab while a row is unlocked blurs its
              // name input and the row's own onBlur re-locks it — surprising,
              // since the pencil unlock is meant to be tab-independent.
              onMouseDown={(e) => e.preventDefault()}
              style={{
                flex: 1, minWidth: 0, border: "none", borderRadius: 6, cursor: "pointer", padding: "6px 4px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, lineHeight: 1.25,
                background: tab === id ? "#fff" : "transparent", color: tab === id ? "#232823" : "#6E6A59",
                boxShadow: tab === id ? "0 1px 3px rgba(35,40,35,0.18)" : "none",
                // "Beschikbaarheid" is one long word with no space to wrap
                // at — without this it silently overflows its half of the
                // segmented control and gets covered by the other tab.
                overflowWrap: "break-word",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 0" }}>
        <div style={{ flex: "1 1 50%", minWidth: 0 }} aria-hidden="true" />
        <div style={{ display: "flex", gap: 6, flex: "1 1 50%", minWidth: 0 }}>
          {PROPS_TAB_COLUMNS[tab].map((col) => (
            <span
              key={col.key}
              style={{
                flex: col.flex, minWidth: 0, fontSize: 10, color: "#9A957F", textAlign: "center", lineHeight: 1.25,
                overflowWrap: "break-word",
              }}
            >
              {col.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoreStatusBadge({ storeId, status, onClick, disabled }) {
  const meta = STORE_META[storeId];
  const bio = status === "bio";
  const nonBio = status === "non_bio_only";
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      title={disabled ? `${meta.name}: druk op het potlood om te wijzigen` : `${meta.name}: ${bio ? "bio" : nonBio ? "niet-bio" : "niet verkrijgbaar / onbekend"} — klik om te wijzigen`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
        minWidth: 26, height: 24, borderRadius: 5, padding: "0 6px", cursor: disabled ? "default" : "pointer",
        fontSize: 10.5, fontWeight: 700, lineHeight: 1, opacity: disabled ? 0.5 : 1,
        background: bio ? meta.border : "transparent",
        border: `1.5px solid ${bio ? meta.border : nonBio ? meta.border : "#D8D3C2"}`,
        color: bio ? "#fff" : nonBio ? meta.border : "#B9B29C",
      }}
    >
      {SHORT_LABEL[storeId]}
      {bio && <Leaf size={9} color="#fff" strokeWidth={3} />}
    </button>
  );
}

// Gebr./pencil/Naam render regardless of "tab" — only the columns after the
// name switch between store availability and the Schap/Per aankoop/Weken
// trio, matching IngredientColumnHeader above. Unlocking a row (the pencil)
// unlocks all of its fields at once, tab-independent, so switching tabs
// mid-edit keeps the row unlocked.
function IngredientRow({ ingredient, usageCount, availability, tab, onRenameBlur, onDelete, onToggleAvailability, onChangeRecipesPerUnit, onChangeRecurringWeeks, onChangeAisleCategory }) {
  const [name, setName] = useState(ingredient.name);
  const [editing, setEditing] = useState(false);
  const [rpu, setRpu] = useState(String(ingredient.recipes_per_unit ?? 1));
  const [recurringWeeks, setRecurringWeeks] = useState(String(ingredient.recurring_interval_weeks ?? 0));
  const originalRef = useRef(ingredient.name);
  const originalRpuRef = useRef(ingredient.recipes_per_unit ?? 1);
  const originalRecurringRef = useRef(ingredient.recurring_interval_weeks ?? 0);

  // Locked look shared by the Schap select and the two number inputs —
  // faded and inert until the pencil unlocks the row.
  const fieldStyle = {
    width: "100%", height: 26, borderRadius: 5, textAlign: "center", fontSize: 11,
    border: "1.5px solid #D8D3C2", background: editing ? "#fff" : "transparent", color: "#5C5F52",
    opacity: editing ? 1 : 0.6, boxSizing: "border-box",
  };

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid #E1DCC9" }}
      // Deliberately no blur-triggered collapse here — tapping a Winkels
      // badge or anything else in the row (or clicking away) used to
      // re-lock the row as a side effect, which read as the row randomly
      // exiting edit mode mid-tap. Locking back up is now only ever an
      // explicit action: the checkmark, or Enter.
      onKeyDown={(e) => { if (e.key === "Enter" && editing) setEditing(false); }}
    >
      {/* Gebr./pencil/Naam — left half, matching IngredientColumnHeader's own left group so this stays lined up with "Gebr." and "Naam" regardless of screen width. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 50%", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "center", width: COL_WIDTH.usage, flexShrink: 0 }}>
          {usageCount > 0 ? (
            <span title={`Gebruikt in ${usageCount} recept${usageCount === 1 ? "" : "en"}`} style={{ fontSize: 11, color: "#6E6A59", textAlign: "center" }}>
              {usageCount}×
            </span>
          ) : (
            <button onClick={() => onDelete(ingredient)} onMouseDown={(e) => e.preventDefault()} aria-label={`${ingredient.name} verwijderen`} style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", padding: 4 }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? `${name} bevestigen` : `${name} bewerken`}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 4, width: COL_WIDTH.pencil, boxSizing: "border-box", flexShrink: 0 }}
        >
          {editing ? <Check size={15} /> : <Pencil size={15} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={name}
              onFocus={() => { originalRef.current = name; }}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onBlur={() => {
                const trimmed = name.trim();
                if (!trimmed) { setName(originalRef.current); return; }
                if (trimmed === originalRef.current) return;
                onRenameBlur(ingredient.id, originalRef.current, trimmed, () => setName(originalRef.current));
              }}
              aria-label={`${ingredient.name} hernoemen`}
              style={{ ...inputStyle, marginTop: 0, width: "100%", boxSizing: "border-box" }}
            />
          ) : (
            <span style={{ display: "block", fontSize: 14, color: "#232823", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </span>
          )}
        </div>
      </div>

      {/* Winkels or Schap/Per aankoop/Weken — right half, same flex shares as PROPS_TAB_COLUMNS so each field sits directly under its own caption. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 50%", minWidth: 0 }}>
        {tab === "beschikbaarheid" ? (
          STORE_ORDER.map((storeId) => (
            <div key={storeId} style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
              <StoreStatusBadge
                storeId={storeId}
                status={availability?.[storeId]}
                disabled={!editing}
                onClick={() => onToggleAvailability(ingredient.id, storeId, nextStatus(availability?.[storeId]))}
              />
            </div>
          ))
        ) : (
          <>
            <div style={{ flex: 2, minWidth: 0 }}>
              <select
                value={ingredient.aisle_category ?? ""}
                disabled={!editing}
                onChange={(e) => onChangeAisleCategory(ingredient.id, e.target.value || null)}
                title="Bepaalt de standaardvolgorde in Lijst en Winkel. Leeg = maakt niet uit, sorteert na de rest."
                aria-label={`${ingredient.name}: schap`}
                style={fieldStyle}
              >
                <option value="">— (maakt niet uit)</option>
                {AISLE_ORDER.map((cat) => (
                  <option key={cat} value={cat}>{AISLE_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="number"
                min={1}
                value={rpu}
                disabled={!editing}
                onFocus={() => { originalRpuRef.current = rpu; }}
                onChange={(e) => setRpu(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(rpu, 10);
                  if (!Number.isFinite(parsed) || parsed < 1) { setRpu(originalRpuRef.current); return; }
                  setRpu(String(parsed));
                  if (parsed === Number(originalRpuRef.current)) return;
                  onChangeRecipesPerUnit(ingredient.id, parsed);
                }}
                title={`Recepten per eenheid — boven de ${REGULAR_THRESHOLD} begint dit ingrediënt standaard doorgestreept in Lijst/Winkel`}
                aria-label={`${ingredient.name}: recepten per eenheid`}
                style={fieldStyle}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="number"
                min={0}
                value={recurringWeeks}
                disabled={!editing}
                onFocus={() => { originalRecurringRef.current = recurringWeeks; }}
                onChange={(e) => setRecurringWeeks(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(recurringWeeks, 10);
                  if (!Number.isFinite(parsed) || parsed < 0) { setRecurringWeeks(originalRecurringRef.current); return; }
                  setRecurringWeeks(String(parsed));
                  if (parsed === Number(originalRecurringRef.current)) return;
                  onChangeRecurringWeeks(ingredient.id, parsed);
                }}
                title="Terugkerend elke ... weken — 0 betekent niet automatisch toegevoegd, ongeacht recepten (boter, koffie, wc papier...)"
                aria-label={`${ingredient.name}: terugkerend elke ... weken`}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Winkels cycle for a not-yet-created ingredient: unset (the default —
// nothing is known yet) -> bio -> non_bio_only -> not_available -> back to
// unset. Unlike STATUS_CYCLE (used once a row already has some status to
// cycle through), this one needs an explicit "no info" state to loop back
// to, since setting it here is optional.
const DRAFT_STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
function nextDraftStatus(current) {
  const idx = DRAFT_STATUS_CYCLE.indexOf(current);
  return idx === -1 ? DRAFT_STATUS_CYCLE[0] : idx === DRAFT_STATUS_CYCLE.length - 1 ? null : DRAFT_STATUS_CYCLE[idx + 1];
}

// Opened by the search bar's "+" (see openNewIngredient below) — every
// property a row can carry is fillable here, all optional besides the name,
// before anything is written to the database (see submitNewIngredient).
function NewIngredientModal({ draft, onChange, onCancel, onSubmit, error }) {
  const update = (patch) => onChange({ ...draft, ...patch });
  return (
    <Modal onClose={onCancel}>
      <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: 0 }}>Nieuw ingrediënt</h3>
          <button onClick={onCancel} aria-label="Sluiten" style={{ background: "none", border: "none", cursor: "pointer", color: "#6E6A59", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <label style={labelStyle}>Naam</label>
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          aria-label="Naam van nieuw ingrediënt"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 14 }}
        />

        <label style={labelStyle}>Winkels (optioneel)</label>
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          {STORE_ORDER.map((storeId) => (
            <div key={storeId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#6E6A59" }}>{STORE_META[storeId].name}</span>
              <StoreStatusBadge
                storeId={storeId}
                status={draft.availability[storeId]}
                onClick={() => update({ availability: { ...draft.availability, [storeId]: nextDraftStatus(draft.availability[storeId]) } })}
              />
            </div>
          ))}
        </div>

        <label style={labelStyle}>Schap (optioneel)</label>
        <select
          value={draft.aisleCategory ?? ""}
          onChange={(e) => update({ aisleCategory: e.target.value || null })}
          aria-label="Schap"
          style={{ ...inputStyle, marginTop: 0, marginBottom: 14 }}
        >
          <option value="">— (maakt niet uit)</option>
          {AISLE_ORDER.map((cat) => (
            <option key={cat} value={cat}>{AISLE_LABELS[cat]}</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Per aankoop</label>
            <input
              type="number" min={1} value={draft.recipesPerUnit}
              onChange={(e) => update({ recipesPerUnit: e.target.value })}
              aria-label="Recepten per eenheid"
              title={`Hoeveel recepten één aankoop meegaat. Boven de ${REGULAR_THRESHOLD} begint het ingrediënt standaard doorgestreept in Lijst en Winkel.`}
              style={{ ...inputStyle, marginTop: 0 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Weken (terugkerend)</label>
            <input
              type="number" min={0} value={draft.recurringWeeks}
              onChange={(e) => update({ recurringWeeks: e.target.value })}
              aria-label="Terugkerend elke ... weken"
              title="0 = niet terugkerend (boter, koffie, wc papier...)"
              style={{ ...inputStyle, marginTop: 0 }}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "#A75135", margin: "0 0 12px" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSubmit} disabled={!draft.name.trim()} style={{ ...generateBtnStyle, flex: 1, opacity: draft.name.trim() ? 1 : 0.5, cursor: draft.name.trim() ? "pointer" : "not-allowed" }}>
            Toevoegen
          </button>
          <button onClick={onCancel} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
            Annuleren
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function IngredientManager({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [availability, setAvailability] = useState({});
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [addError, setAddError] = useState("");
  // Draft for the "+"-triggered new-ingredient modal — null when closed.
  // {name, availability, aisleCategory, recipesPerUnit, recurringWeeks}
  const [newIngredientDraft, setNewIngredientDraft] = useState(null);
  const [newIngredientError, setNewIngredientError] = useState("");
  const [pendingMerge, setPendingMerge] = useState(null); // { fromId, fromName, toId, toName, revert }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saveErr, setSaveErr] = useState(false);
  // Which set of per-ingredient columns is showing — Gebr./pencil/Naam are
  // always visible regardless (see IngredientRow/IngredientColumnHeader).
  const [propsTab, setPropsTab] = useState("beschikbaarheid"); // "beschikbaarheid" | "aanvullend"

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchIngredientsData();
        setIngredients(data.ingredients);
        setUsageCounts(data.usageCounts);
        setAvailability(data.availability);
      } catch { setSaveErr(true); }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      for (const storeId of STORE_ORDER) {
        const want = filters.stores[storeId];
        if (want === "any") continue;
        if ((availability[i.id]?.[storeId] ?? "not_available") !== want) return false;
      }
      if (filters.aisle !== "any") {
        const cat = i.aisle_category ?? null;
        if (filters.aisle === "none" ? cat !== null : cat !== filters.aisle) return false;
      }
      if (filters.regularity !== "any") {
        const staple = isRegular(i.recipes_per_unit);
        if (filters.regularity === "staple" && !staple) return false;
        if (filters.regularity === "regular" && staple) return false;
      }
      if (filters.recurring !== "any") {
        const recurring = (i.recurring_interval_weeks ?? 0) > 0;
        if (filters.recurring === "yes" && !recurring) return false;
        if (filters.recurring === "no" && recurring) return false;
      }
      if (filters.usage !== "any") {
        const used = (usageCounts[i.id] || 0) > 0;
        if (filters.usage === "used" && !used) return false;
        if (filters.usage === "unused" && used) return false;
      }
      return true;
    });
  }, [ingredients, query, filters, availability, usageCounts]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const storeId of STORE_ORDER) if (filters.stores[storeId] !== "any") n++;
    if (filters.aisle !== "any") n++;
    if (filters.regularity !== "any") n++;
    if (filters.recurring !== "any") n++;
    if (filters.usage !== "any") n++;
    return n;
  }, [filters]);

  // Fires from the "+" inside the search bar (or Enter in it) — used both to
  // find and to create, so a search that comes up empty needs just one more
  // tap to add that same name. Opens the new-ingredient modal pre-filled
  // with the searched name rather than creating it right away, so Winkels/
  // Schap/Per aankoop/Weken can all be set before anything hits the database.
  const openNewIngredient = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (ingredients.some((i) => i.name === trimmed)) { setAddError("Dit ingrediënt bestaat al."); return; }
    setAddError("");
    setNewIngredientError("");
    setNewIngredientDraft({ name: trimmed, availability: {}, aisleCategory: null, recipesPerUnit: "1", recurringWeeks: "0" });
  };

  const cancelNewIngredient = () => {
    setNewIngredientDraft(null);
    setNewIngredientError("");
  };

  // The modal's own "Toevoegen" — only now does the ingredient (and whatever
  // Winkels/Schap/Per aankoop/Weken were set on it) actually get written.
  const submitNewIngredient = async () => {
    const trimmed = newIngredientDraft.name.trim();
    if (!trimmed) return;
    if (ingredients.some((i) => i.name === trimmed)) { setNewIngredientError("Dit ingrediënt bestaat al."); return; }
    setNewIngredientError("");
    const rpu = parseInt(newIngredientDraft.recipesPerUnit, 10);
    const recurringWeeks = parseInt(newIngredientDraft.recurringWeeks, 10);
    const availabilityEntries = Object.entries(newIngredientDraft.availability).filter(([, status]) => status);
    try {
      const created = await createIngredient(trimmed);
      for (const [storeId, status] of availabilityEntries) {
        await setIngredientAvailability(created.id, storeId, status);
      }
      if (newIngredientDraft.aisleCategory) await setIngredientAisleCategory(created.id, newIngredientDraft.aisleCategory);
      if (Number.isFinite(rpu) && rpu !== 1) await setIngredientRecipesPerUnit(created.id, rpu);
      if (Number.isFinite(recurringWeeks) && recurringWeeks > 0) await upsertRecurringItem(created.id, recurringWeeks);

      setIngredients((prev) => [...prev, {
        ...created,
        recipes_per_unit: Number.isFinite(rpu) ? rpu : 1,
        aisle_category: newIngredientDraft.aisleCategory,
        recurring_interval_weeks: Number.isFinite(recurringWeeks) && recurringWeeks > 0 ? recurringWeeks : null,
      }]);
      if (availabilityEntries.length > 0) {
        setAvailability((prev) => ({ ...prev, [created.id]: Object.fromEntries(availabilityEntries) }));
      }
      setQuery("");
      setNewIngredientDraft(null);
    } catch { setSaveErr(true); }
  };

  const handleRenameBlur = async (id, oldName, newVal, revert) => {
    if (ingredients.some((i) => i.id !== id && i.name === newVal)) {
      const target = ingredients.find((i) => i.id !== id && i.name === newVal);
      setPendingMerge({ fromId: id, fromName: oldName, toId: target.id, toName: newVal, revert });
      return;
    }
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, name: newVal } : i)));
    try {
      const result = await renameIngredient(id, newVal);
      if (result.collision) {
        // Rare race: another change made this collide between our check and the update.
        const target = ingredients.find((i) => i.name === newVal);
        setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, name: oldName } : i)));
        revert();
        if (target) setPendingMerge({ fromId: id, fromName: oldName, toId: target.id, toName: newVal, revert });
      }
    } catch {
      setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, name: oldName } : i)));
      revert();
      setSaveErr(true);
    }
  };

  const confirmMerge = async () => {
    const { fromId, toId } = pendingMerge;
    try {
      await mergeIngredient(fromId, toId);
      setIngredients((prev) => prev.filter((i) => i.id !== fromId));
      setUsageCounts((prev) => {
        const next = { ...prev };
        next[toId] = (next[toId] || 0) + (next[fromId] || 0);
        delete next[fromId];
        return next;
      });
      setAvailability((prev) => {
        const next = { ...prev };
        delete next[fromId];
        return next;
      });
    } catch { setSaveErr(true); }
    setPendingMerge(null);
  };

  const cancelMerge = () => {
    pendingMerge?.revert();
    setPendingMerge(null);
  };

  const handleDelete = async () => {
    try {
      await deleteIngredient(confirmDelete.id);
      setIngredients((prev) => prev.filter((i) => i.id !== confirmDelete.id));
    } catch { setSaveErr(true); }
    setConfirmDelete(null);
  };

  const handleToggleAvailability = async (ingredientId, storeId, status) => {
    setAvailability((prev) => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [storeId]: status } }));
    try {
      await setIngredientAvailability(ingredientId, storeId, status);
    } catch { setSaveErr(true); }
  };

  const handleChangeRecipesPerUnit = async (ingredientId, recipesPerUnit) => {
    setIngredients((prev) => prev.map((i) => (i.id === ingredientId ? { ...i, recipes_per_unit: recipesPerUnit } : i)));
    try {
      await setIngredientRecipesPerUnit(ingredientId, recipesPerUnit);
    } catch { setSaveErr(true); }
  };

  const handleChangeAisleCategory = async (ingredientId, aisleCategory) => {
    setIngredients((prev) => prev.map((i) => (i.id === ingredientId ? { ...i, aisle_category: aisleCategory } : i)));
    try {
      await setIngredientAisleCategory(ingredientId, aisleCategory);
    } catch { setSaveErr(true); }
  };

  const handleChangeRecurringWeeks = async (ingredientId, weeks) => {
    setIngredients((prev) => prev.map((i) => (i.id === ingredientId ? { ...i, recurring_interval_weeks: weeks || null } : i)));
    try {
      if (weeks > 0) await upsertRecurringItem(ingredientId, weeks);
      else await removeRecurringItem(ingredientId);
    } catch { setSaveErr(true); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21, margin: 0 }}>Ingrediënten beheren</h2>
        <button className="ledger-btn link-btn" onClick={onClose} style={{ background: "none", border: "none", fontSize: 13, color: "#5C7A5E", cursor: "pointer", fontWeight: 600 }}>
          Terug naar planning
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: "#6E6A59", lineHeight: 1.5, margin: "0 0 14px" }}>
        Tik op het potlood om een rij te ontgrendelen voor bewerken — een naam die al bestaat wordt dan samengevoegd
        met recepten en winkelgegevens. Tik op een winkel-badge om te wisselen tussen bio, niet-bio en niet
        verkrijgbaar. Tik op het vinkje of druk op Enter om de rij weer te vergrendelen. Bij Aanvullende info bepaalt
        Per aankoop of iets (zoals zout of olijfolie) standaard is doorgestreept boven de {REGULAR_THRESHOLD}; Weken
        is het terugkerende interval (zoals boter), 0 = niet terugkerend.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color="#6E6A59" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setAddError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") openNewIngredient(); }}
            placeholder="Zoek/nieuw ingrediënt…"
            aria-label="Zoek of nieuw ingrediënt"
            style={{ ...inputStyle, marginTop: 0, paddingLeft: 32, paddingRight: 34 }}
          />
          <button
            onClick={openNewIngredient}
            disabled={!query.trim()}
            aria-label="Ingrediënt toevoegen"
            style={{
              position: "absolute", right: 3, top: 3, bottom: 3,
              width: 26, borderRadius: 5, border: "none",
              background: query.trim() ? "#5C7A5E" : "transparent", color: query.trim() ? "#fff" : "#B9B29C",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: query.trim() ? "pointer" : "default",
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className="ledger-btn"
          aria-label={activeFilterCount > 0 ? `Filteren (${activeFilterCount} actief)` : "Filteren"}
          style={{ ...navBtnStyle, width: "auto", padding: "0 14px", position: "relative", flexShrink: 0 }}
        >
          <Filter size={16} />
          {activeFilterCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8,
                background: "#A75135", color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
      {addError && <p style={{ fontSize: 12, color: "#A75135", margin: "0 0 8px" }}>{addError}</p>}
      {saveErr && (
        <p style={{ fontSize: 12, color: "#A75135", margin: "0 0 8px" }}>
          Opslaan lukte net niet — probeer het zo nog eens.
        </p>
      )}

      {/* overflowX alone would force the browser to also treat overflowY as
          "auto" (any non-visible value on one axis does this to the other),
          which turns this div into its own scroll container — and a
          position:sticky header only pins within its nearest scroll
          container, so without a bounded height here it would've quietly
          stopped sticking to the page at all once you scrolled. Giving it
          an explicit maxHeight + overflowY makes that scroll container the
          intended one, so the sticky header pins the way it looks like it
          should. */}
      {loading ? (
        <p style={{ fontSize: 13, color: "#6E6A59", padding: "16px 4px" }}>Laden…</p>
      ) : (
        <div style={{ borderTop: "1px solid #C9C2AE", overflowX: "auto", overflowY: "auto", maxHeight: "65vh", WebkitOverflowScrolling: "touch" }}>
          <IngredientColumnHeader tab={propsTab} onTabChange={setPropsTab} />
          {filtered.length === 0 && (
            <p style={{ fontSize: 13, color: "#6E6A59", padding: "16px 4px" }}>
              Geen ingrediënten gevonden{activeFilterCount > 0 ? " — pas de filters aan" : ""}.
            </p>
          )}
          {filtered.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              usageCount={usageCounts[ingredient.id] || 0}
              availability={availability[ingredient.id]}
              tab={propsTab}
              onRenameBlur={handleRenameBlur}
              onDelete={setConfirmDelete}
              onToggleAvailability={handleToggleAvailability}
              onChangeRecipesPerUnit={handleChangeRecipesPerUnit}
              onChangeRecurringWeeks={handleChangeRecurringWeeks}
              onChangeAisleCategory={handleChangeAisleCategory}
            />
          ))}
        </div>
      )}

      {filterOpen && (
        <IngredientFilterModal filters={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />
      )}

      {newIngredientDraft && (
        <NewIngredientModal
          draft={newIngredientDraft}
          onChange={setNewIngredientDraft}
          onCancel={cancelNewIngredient}
          onSubmit={submitNewIngredient}
          error={newIngredientError}
        />
      )}

      {pendingMerge && (
        <Modal onClose={cancelMerge}>
          <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>
              Samenvoegen?
            </h3>
            <p style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.5, margin: "0 0 18px" }}>
              <strong>{pendingMerge.toName}</strong> bestaat al. Wil je <strong>{pendingMerge.fromName}</strong> hiermee samenvoegen?
              Alle recepten die {pendingMerge.fromName} gebruiken worden overgezet naar {pendingMerge.toName}, en eventuele
              winkelgegevens van {pendingMerge.fromName} gaan verloren. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmMerge} style={{ ...generateBtnStyle, background: "#A75135", flex: 1 }}>
                Samenvoegen
              </button>
              <button onClick={cancelMerge} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
                Annuleren
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>
              Ingrediënt verwijderen?
            </h3>
            <p style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.5, margin: "0 0 18px" }}>
              Weet je zeker dat je <strong>{confirmDelete.name}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleDelete} style={{ ...generateBtnStyle, background: "#A75135", flex: 1 }}>
                Verwijderen
              </button>
              <button onClick={() => setConfirmDelete(null)} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
                Annuleren
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
