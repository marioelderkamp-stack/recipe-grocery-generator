import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Trash2, Leaf } from "lucide-react";
import { STORE_ORDER, STORE_META } from "./lib.js";
import { fetchIngredientsData, createIngredient, renameIngredient, mergeIngredient, deleteIngredient, setIngredientAvailability } from "./api.js";
import { inputStyle, generateBtnStyle, navBtnStyle } from "./styles.js";
import Modal from "./Modal.jsx";

const SHORT_LABEL = { lidl: "L", ah: "AH", ekoplaza: "E" };
const STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
const nextStatus = (current) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];

function StoreStatusBadge({ storeId, status, onClick }) {
  const meta = STORE_META[storeId];
  const bio = status === "bio";
  const nonBio = status === "non_bio_only";
  return (
    <button
      onClick={onClick}
      title={`${meta.name}: ${bio ? "bio" : nonBio ? "niet-bio" : "niet verkrijgbaar / onbekend"} — klik om te wijzigen`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
        minWidth: 24, height: 22, borderRadius: 5, padding: "0 5px", cursor: "pointer",
        fontSize: 10.5, fontWeight: 700, lineHeight: 1,
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

function IngredientRow({ ingredient, usageCount, availability, onRenameBlur, onDelete, onToggleAvailability }) {
  const [name, setName] = useState(ingredient.name);
  const originalRef = useRef(ingredient.name);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid #E1DCC9" }}>
      <input
        value={name}
        onFocus={() => { originalRef.current = name; }}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (!trimmed) { setName(originalRef.current); return; }
          if (trimmed === originalRef.current) return;
          onRenameBlur(ingredient.id, originalRef.current, trimmed, () => setName(originalRef.current));
        }}
        style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 0 }}
      />
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {STORE_ORDER.map((storeId) => (
          <StoreStatusBadge
            key={storeId}
            storeId={storeId}
            status={availability?.[storeId]}
            onClick={() => onToggleAvailability(ingredient.id, storeId, nextStatus(availability?.[storeId]))}
          />
        ))}
      </div>
      {usageCount > 0 ? (
        <span title={`Gebruikt in ${usageCount} recept${usageCount === 1 ? "" : "en"}`} style={{ fontSize: 11, color: "#8A8570", flexShrink: 0, width: 22, textAlign: "center" }}>
          {usageCount}×
        </span>
      ) : (
        <button onClick={() => onDelete(ingredient)} aria-label={`${ingredient.name} verwijderen`} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", padding: 4, flexShrink: 0 }}>
          <Trash2 size={15} />
        </button>
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21, margin: 0 }}>Ingrediënten beheren</h2>
        <button className="ledger-btn link-btn" onClick={onClose} style={{ background: "none", border: "none", fontSize: 13, color: "#5C7A5E", cursor: "pointer", fontWeight: 600 }}>
          Terug naar planning
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: "#8A8570", margin: "0 0 14px" }}>
        Tik op een naam om te hernoemen (samenvoegen als de nieuwe naam al bestaat), of op een winkel-badge om bio/niet-bio/niet verkrijgbaar te doorlopen.
      </p>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} color="#8A8570" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
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
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
        />
        <button onClick={handleAdd} className="ledger-btn" style={{ ...navBtnStyle, width: "auto", padding: "0 14px" }} aria-label="Ingrediënt toevoegen">
          <Plus size={16} />
        </button>
      </div>
      {addError && <p style={{ fontSize: 12, color: "#B5583A", margin: "0 0 8px" }}>{addError}</p>}
      {saveErr && (
        <p style={{ fontSize: 12, color: "#B5583A", margin: "0 0 8px" }}>
          Opslaan lukte net niet — probeer het zo nog eens.
        </p>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "#8A8570", padding: "16px 4px" }}>Laden…</p>
      ) : (
        <div style={{ borderTop: "1px solid #C9C2AE" }}>
          {filtered.length === 0 && (
            <p style={{ fontSize: 13, color: "#8A8570", padding: "16px 4px" }}>Geen ingrediënten gevonden.</p>
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
              <button onClick={confirmMerge} style={{ ...generateBtnStyle, background: "#B5583A", flex: 1 }}>
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
              <button onClick={handleDelete} style={{ ...generateBtnStyle, background: "#B5583A", flex: 1 }}>
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
