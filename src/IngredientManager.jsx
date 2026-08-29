import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Trash2, Leaf, Pencil, Info, Filter, X } from "lucide-react";
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
const COL_WIDTH = { pencil: 23, stores: 90, aisle: 30, rpu: 34, recurring: 34, usage: 24 };

const columnHeaderStyle = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 11.4, fontWeight: 600, lineHeight: 1.25,
  color: "#5C5F52", textAlign: "center",
};

// A column header label with a small "i" — tapping it shows what that column
// means and how to change it, so the explanation lives next to the value
// instead of in one long paragraph above the table. A real button + popover
// rather than a `title` tooltip, since `title` never fires on a touch tap.
function HeaderInfo({ children, info }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
      {children}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={info}
        aria-expanded={open}
        style={{ background: "none", border: "none", padding: 6, margin: -6, cursor: "pointer", display: "flex", flexShrink: 0 }}
      >
        <Info size={10} color="#9A957F" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div
            role="tooltip"
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
              zIndex: 100, width: 180, maxWidth: "60vw", background: "#fff", border: "1px solid #C9C2AE", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(35,40,35,0.18)", padding: "10px 12px", fontSize: 12, fontWeight: 400,
              color: "#4A4E42", textAlign: "left", lineHeight: 1.45, fontFamily: "'Inter', sans-serif",
            }}
          >
            {info}
          </div>
        </>
      )}
    </span>
  );
}

// "tab" picks which set of tab-specific columns follows the always-present
// Gebr./pencil/Naam columns — "beschikbaarheid" shows the store badges,
// "aanvullend" shows Schap/Per aankoop/Weken. Mirrors IngredientRow's own
// tab switch below so header labels always match what a row renders.
function IngredientColumnHeader({ tab }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-end", gap: 10, padding: "0 4px 6px", borderBottom: "1px solid #C9C2AE",
        // Bottom-aligned so a wrapping label (e.g. "Per aankoop") still sits
        // flush with its single-line neighbors instead of floating above them.
        // Sticky + an opaque background keeps the header reachable and
        // legible once the row list scrolls under it.
        position: "sticky", top: 0, zIndex: 1, background: "#EEEBE2",
      }}
    >
      <span style={{ ...columnHeaderStyle, width: COL_WIDTH.usage, flexShrink: 0 }}>Gebr.</span>
      <span style={{ width: COL_WIDTH.pencil, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ ...columnHeaderStyle, flex: 1, minWidth: 0, textAlign: "left" }}>
        <HeaderInfo info="Tik op het potlood om deze rij te ontgrendelen voor bewerken. Een nieuwe naam die al bestaat wordt samengevoegd — recepten en winkelgegevens van het oude ingrediënt gaan dan over naar het bestaande.">
          Naam
        </HeaderInfo>
      </span>
      {tab === "beschikbaarheid" ? (
        <span style={{ ...columnHeaderStyle, width: COL_WIDTH.stores, flexShrink: 0 }}>
          <HeaderInfo info="Tik (na ontgrendelen) op een winkel-badge om te wisselen tussen bio, niet-bio en niet verkrijgbaar.">
            Winkels
          </HeaderInfo>
        </span>
      ) : (
        <>
          <span style={{ ...columnHeaderStyle, width: COL_WIDTH.aisle, flexShrink: 0 }}>
            <HeaderInfo info="Bepaalt de standaardvolgorde in Lijst en Winkel volgens de Lidl-route: 1 fruit, 2 groente, 3 brood, 4 kruiden, 5 noten, 6 houdbaar, 7 kaas/vlees/vis. — betekent dat het niet uitmaakt en achteraan sorteert.">
              Schap
            </HeaderInfo>
          </span>
          <span style={{ ...columnHeaderStyle, width: COL_WIDTH.rpu, flexShrink: 0 }}>
            <HeaderInfo info={`Hoeveel recepten één aankoop meegaat. Boven de ${REGULAR_THRESHOLD} (zout, sojasaus, olijfolie...) begint het ingrediënt standaard doorgestreept in Lijst en Winkel.`}>
              Per aankoop
            </HeaderInfo>
          </span>
          <span style={{ ...columnHeaderStyle, width: COL_WIDTH.recurring, flexShrink: 0 }}>
            <HeaderInfo info="Elke ... weken terugkerend (boter, koffie, wc papier...): verschijnt vanzelf zodra het weer aan de beurt is, ongeacht of een recept het deze week nodig heeft. 0 betekent niet terugkerend.">
              Weken
            </HeaderInfo>
          </span>
        </>
      )}
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

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid #E1DCC9" }}
      onBlur={(e) => {
        // Only collapse back to locked once focus actually leaves the row —
        // tapping the rpu field or a badge from the name field would
        // otherwise blur the name input and re-lock the row mid-edit.
        if (!e.currentTarget.contains(e.relatedTarget)) setEditing(false);
      }}
    >
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
        onClick={() => setEditing(true)}
        disabled={editing}
        aria-label={`${name} bewerken`}
        style={{ background: "none", border: "none", cursor: editing ? "default" : "pointer", color: editing ? "#C9C2AE" : "#5C7A5E", padding: 4, width: COL_WIDTH.pencil, boxSizing: "border-box", flexShrink: 0 }}
      >
        <Pencil size={15} />
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
      {tab === "beschikbaarheid" ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 4, width: COL_WIDTH.stores, flexShrink: 0 }}>
          {STORE_ORDER.map((storeId) => (
            <StoreStatusBadge
              key={storeId}
              storeId={storeId}
              status={availability?.[storeId]}
              disabled={!editing}
              onClick={() => onToggleAvailability(ingredient.id, storeId, nextStatus(availability?.[storeId]))}
            />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center", width: COL_WIDTH.aisle, flexShrink: 0 }}>
            <select
              value={ingredient.aisle_category ?? ""}
              disabled={!editing}
              onChange={(e) => onChangeAisleCategory(ingredient.id, e.target.value || null)}
              title={`Schap: ${ingredient.aisle_category ? `${AISLE_ORDER.indexOf(ingredient.aisle_category) + 1} (${AISLE_LABELS[ingredient.aisle_category]})` : "— (maakt niet uit)"} — bepaalt de standaardvolgorde in Lijst en Winkel volgens de Lidl-route: 1 fruit, 2 groente, 3 brood, 4 kruiden, 5 noten, 6 houdbaar, 7 kaas/vlees/vis. Leeg = maakt niet uit, sorteert na de rest.`}
              aria-label={`${ingredient.name}: schap`}
              style={{
                width: "100%", height: 24, borderRadius: 5, textAlign: "center", fontSize: 10.5,
                border: "1.5px solid #D8D3C2", background: editing ? "#fff" : "transparent", color: "#5C5F52",
                opacity: editing ? 1 : 0.6,
              }}
            >
              <option value="">—</option>
              {AISLE_ORDER.map((cat, i) => (
                <option key={cat} value={cat} title={AISLE_LABELS[cat]}>{i + 1}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "center", width: COL_WIDTH.rpu, flexShrink: 0 }}>
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
              style={{
                width: 34, height: 24, flexShrink: 0, borderRadius: 5, textAlign: "center", fontSize: 11.5,
                border: "1.5px solid #D8D3C2", background: editing ? "#fff" : "transparent", color: "#5C5F52",
                opacity: editing ? 1 : 0.6,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "center", width: COL_WIDTH.recurring, flexShrink: 0 }}>
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
              style={{
                width: 34, height: 24, flexShrink: 0, borderRadius: 5, textAlign: "center", fontSize: 11.5,
                border: "1.5px solid #D8D3C2", background: editing ? "#fff" : "transparent", color: "#5C5F52",
                opacity: editing ? 1 : 0.6,
              }}
            />
          </div>
        </>
      )}
    </div>
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
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
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

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (ingredients.some((i) => i.name === trimmed)) { setAddError("Dit ingrediënt bestaat al."); return; }
    setAddError("");
    try {
      const created = await createIngredient(trimmed);
      setIngredients((prev) => [...prev, created]);
      setNewName("");
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

      <p style={{ fontSize: 12.5, color: "#6E6A59", margin: "0 0 14px" }}>
        Tik op het potlood om een rij te ontgrendelen voor bewerken. Tik op een <Info size={11} color="#9A957F" style={{ verticalAlign: -1 }} /> bij een kolomkop voor uitleg over die kolom.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} color="#6E6A59" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek ingrediënt…"
            aria-label="Zoek ingrediënten"
            style={{ ...inputStyle, marginTop: 0, paddingLeft: 32 }}
          />
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

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setAddError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Nieuw ingrediënt…"
          aria-label="Nieuw ingrediënt"
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
        />
        <button onClick={handleAdd} className="ledger-btn" style={{ ...navBtnStyle, width: "auto", padding: "0 14px" }} aria-label="Ingrediënt toevoegen">
          <Plus size={16} />
        </button>
      </div>
      {addError && <p style={{ fontSize: 12, color: "#A75135", margin: "0 0 8px" }}>{addError}</p>}
      {saveErr && (
        <p style={{ fontSize: 12, color: "#A75135", margin: "0 0 8px" }}>
          Opslaan lukte net niet — probeer het zo nog eens.
        </p>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 10, borderBottom: "1px solid #C9C2AE" }}>
        {[["beschikbaarheid", "Beschikbaarheid"], ["aanvullend", "Aanvullende info"]].map(([id, label]) => (
          <button
            key={id}
            className="ledger-btn"
            onClick={() => setPropsTab(id)}
            // Without this, tapping a tab while a row is unlocked blurs its
            // name input and the row's own onBlur re-locks it — surprising,
            // since the pencil unlock is meant to be tab-independent.
            onMouseDown={(e) => e.preventDefault()}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 0",
              fontSize: 14.5, fontWeight: 700, color: propsTab === id ? "#232823" : "#6E6A59",
              borderBottom: propsTab === id ? "2px solid #5C7A5E" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

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
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6E6A59", padding: "16px 4px" }}>
              Geen ingrediënten gevonden{activeFilterCount > 0 ? " — pas de filters aan" : ""}.
            </p>
          ) : (
            <IngredientColumnHeader tab={propsTab} />
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
