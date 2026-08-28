import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Trash2, Leaf, Pencil, Info } from "lucide-react";
import { STORE_ORDER, STORE_META, REGULAR_THRESHOLD, AISLE_ORDER, AISLE_LABELS } from "./lib.js";
import { fetchIngredientsData, createIngredient, renameIngredient, mergeIngredient, deleteIngredient, setIngredientAvailability, setIngredientRecipesPerUnit, setIngredientAisleCategory, upsertRecurringItem, removeRecurringItem } from "./api.js";
import { inputStyle, generateBtnStyle, navBtnStyle } from "./styles.js";
import Modal from "./Modal.jsx";

const SHORT_LABEL = { lidl: "L", ah: "AH", ekoplaza: "E" };
const STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
const nextStatus = (current) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];

// Shared with the header row so its labels line up with what each row actually renders.
const COL_WIDTH = { pencil: 23, stores: 90, aisle: 30, rpu: 34, recurring: 34, usage: 24 };
const columnHeaderStyle = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 600, lineHeight: 1.25,
  color: "#5C5F52", textAlign: "center",
};

// A column header label with a small "i" — tapping/hovering it shows what
// that column means and how to change it, so the explanation lives next to
// the value instead of in one long paragraph above the table.
function HeaderInfo({ children, info }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
      {children}
      <Info size={10} color="#9A957F" style={{ flexShrink: 0, cursor: "help" }} title={info} aria-label={info} />
    </span>
  );
}

function IngredientColumnHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 6px", borderBottom: "1px solid #C9C2AE" }}>
      <span style={{ width: COL_WIDTH.pencil, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ ...columnHeaderStyle, flex: 1, minWidth: 0, textAlign: "left" }}>
        <HeaderInfo info="Tik op het potlood om deze rij te ontgrendelen voor bewerken. Een nieuwe naam die al bestaat wordt samengevoegd — recepten en winkelgegevens van het oude ingrediënt gaan dan over naar het bestaande.">
          Naam
        </HeaderInfo>
      </span>
      <span style={{ ...columnHeaderStyle, width: COL_WIDTH.stores, flexShrink: 0 }}>
        <HeaderInfo info="Tik (na ontgrendelen) op een winkel-badge om te wisselen tussen bio, niet-bio en niet verkrijgbaar.">
          Winkels
        </HeaderInfo>
      </span>
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
      <span style={{ ...columnHeaderStyle, width: COL_WIDTH.usage, flexShrink: 0 }}>Gebr.</span>
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

function IngredientRow({ ingredient, usageCount, availability, onRenameBlur, onDelete, onToggleAvailability, onChangeRecipesPerUnit, onChangeRecurringWeeks, onChangeAisleCategory }) {
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
      <button
        onClick={() => setEditing(true)}
        disabled={editing}
        aria-label={`${name} bewerken`}
        style={{ background: "none", border: "none", cursor: editing ? "default" : "pointer", color: editing ? "#C9C2AE" : "#5C7A5E", padding: 4, width: COL_WIDTH.pencil, boxSizing: "border-box", flexShrink: 0 }}
      >
        <Pencil size={15} />
      </button>
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
          style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 0 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "#232823", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      )}
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
    </div>
  );
}

export default function IngredientManager({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [availability, setAvailability] = useState({});
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [pendingMerge, setPendingMerge] = useState(null); // { fromId, fromName, toId, toName, revert }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saveErr, setSaveErr] = useState(false);

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
    if (!q) return sorted;
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, query]);

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

      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} color="#6E6A59" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek ingrediënt…"
          aria-label="Zoek ingrediënten"
          style={{ ...inputStyle, marginTop: 0, paddingLeft: 32 }}
        />
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

      {loading ? (
        <p style={{ fontSize: 13, color: "#6E6A59", padding: "16px 4px" }}>Laden…</p>
      ) : (
        <div style={{ borderTop: "1px solid #C9C2AE" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6E6A59", padding: "16px 4px" }}>Geen ingrediënten gevonden.</p>
          ) : (
            <IngredientColumnHeader />
          )}
          {filtered.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              usageCount={usageCounts[ingredient.id] || 0}
              availability={availability[ingredient.id]}
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
