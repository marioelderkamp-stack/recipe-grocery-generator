import { useState, useMemo, useRef } from "react";
import { Search, Trash2, RefreshCw } from "lucide-react";
import { RESTOCK_CATEGORIES, weeksBetween, isRestockDue, STORE_ORDER, nextStoreStatus, dstr, addDays } from "./lib.js";
import { StoreStatusBadge } from "./IngredientManager.jsx";
import { inputStyle } from "./styles.js";

function weeksUntilDue(category, restockState, weekStart) {
  for (let w = 0; w <= 30; w++) {
    if (isRestockDue(category, restockState, dstr(addDays(weekStart, w * 7)))) return w;
  }
  return 30;
}

function statusHint(category, restockState, weekStart) {
  const weeksSince = weeksBetween(dstr(weekStart), restockState.lastBoughtWeek);
  if (weeksSince <= 0) return "Net gekocht";
  const wait = weeksUntilDue(category, restockState, weekStart);
  if (wait === 0) return "Deze week nodig";
  return `Over ~${wait} week${wait === 1 ? "" : "en"}`;
}

// Shared search+dropdown for picking an existing ingredient or typing a new
// name — same interaction pattern as MealPicker.jsx's recipe search.
function IngredientSearch({ ingredientNames, placeholder, onPick }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ingredientNames.filter((n) => n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b)).slice(0, 8);
  }, [ingredientNames, query]);

  const exactMatch = ingredientNames.some((n) => n.toLowerCase() === query.trim().toLowerCase());
  const trimmed = query.trim();

  const pick = (name) => {
    onPick(name);
    setQuery("");
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} color="#6E6A59" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setQuery(""), 120)}
          onKeyDown={(e) => { if (e.key === "Enter" && trimmed) pick(trimmed); }}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{ ...inputStyle, marginTop: 0, width: "100%", paddingLeft: 30, fontSize: 14 }}
        />
      </div>
      {trimmed && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 20,
          background: "#fff", border: "1px solid #C9C2AE", borderRadius: 7,
          boxShadow: "0 4px 10px rgba(35,40,35,0.12)", maxHeight: 260, overflowY: "auto",
        }}>
          {filtered.map((n) => (
            <div key={n} onMouseDown={(e) => { e.preventDefault(); pick(n); }} style={{ padding: "8px 10px", fontSize: 13.5, cursor: "pointer" }}>
              {n}
            </div>
          ))}
          {!exactMatch && (
            <div onMouseDown={(e) => { e.preventDefault(); pick(trimmed); }} style={{ padding: "8px 10px", fontSize: 13.5, cursor: "pointer", color: "#5C7A5E", fontWeight: 600 }}>
              + "{trimmed}" toevoegen als nieuw ingrediënt
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {RESTOCK_CATEGORIES.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: active ? "#5C7A5E" : "#F7F5EE", color: active ? "#fff" : "#232823",
              border: active ? "1px solid #5C7A5E" : "1px solid #C9C2AE",
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function NewIngredientStorePicker({ name, availability, onSetAvailability }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", background: "#F7F5EE", borderRadius: 8, border: "1px solid #C9C2AE" }}>
      <span style={{ fontSize: 12.5, color: "#6E6A59", flex: 1 }}>Winkel voor "{name}":</span>
      {STORE_ORDER.map((storeId) => (
        <StoreStatusBadge
          key={storeId}
          storeId={storeId}
          status={availability?.[storeId]}
          disabled={false}
          onClick={() => onSetAvailability(name, storeId, nextStoreStatus(availability?.[storeId]))}
        />
      ))}
    </div>
  );
}

export default function VoorraadTab({
  weekStart,
  ingredientNames,
  ingredientRestock,
  availability,
  onQuickAdd,
  onSetAvailability,
  onTrackIngredient,
  onUpdateCategory,
  onMarkBought,
  onRemoveTracking,
}) {
  const [pendingStoreFor, setPendingStoreFor] = useState(null);
  const [addingTrackName, setAddingTrackName] = useState(null);
  const [addingTrackCategory, setAddingTrackCategory] = useState("maandelijks");

  const trackedEntries = useMemo(
    () => Object.entries(ingredientRestock).sort(([a], [b]) => a.localeCompare(b)),
    [ingredientRestock],
  );

  const handleQuickAdd = (name) => {
    const isNew = !ingredientNames.includes(name);
    onQuickAdd(name);
    if (isNew) setPendingStoreFor(name);
  };

  const handleConfirmTrack = () => {
    if (!addingTrackName) return;
    const isNew = !ingredientNames.includes(addingTrackName);
    onTrackIngredient(addingTrackName, addingTrackCategory, isNew);
    setAddingTrackName(null);
    setAddingTrackCategory("maandelijks");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 16px", lineHeight: 1.5 }}>
        Geen voorraadbeheer, maar een snelle manier om te vertalen wat je toch al weet naar de boodschappenlijst:
        voeg iets eenmalig toe, of laat een ingrediënt bijhouden zodat het vanzelf terugkomt zodra het waarschijnlijk op is.
      </p>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Snel toevoegen</h3>
        <p style={{ fontSize: 12.5, color: "#6E6A59", margin: "0 0 8px" }}>
          Voor iets dat je nu net nodig hebt, zonder het verder bij te houden — komt op de lijst van deze week.
        </p>
        <IngredientSearch ingredientNames={ingredientNames} placeholder="Zoek of typ een ingrediënt…" onPick={handleQuickAdd} />
        {pendingStoreFor && (
          <NewIngredientStorePicker name={pendingStoreFor} availability={availability[pendingStoreFor]} onSetAvailability={onSetAvailability} />
        )}
      </section>

      <section>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>Automatisch bijhouden</h3>
        <p style={{ fontSize: 12.5, color: "#6E6A59", margin: "0 0 10px" }}>
          Kies hoe vaak je iets meestal (opnieuw) koopt — de inschatting stelt zich vanzelf bij op basis van wanneer je het echt afstreept.
        </p>

        {trackedEntries.length === 0 && (
          <p style={{ fontSize: 13, color: "#6E6A59", fontStyle: "italic", margin: "0 0 12px" }}>Nog niets bijgehouden.</p>
        )}

        {trackedEntries.map(([name, state]) => {
          const catDef = RESTOCK_CATEGORIES.find((c) => c.id === state.category);
          return (
            <div key={name} style={{ border: "1px solid #C9C2AE", borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: "#F7F5EE" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "#232823" }}>{name}</span>
                <span style={{ fontSize: 12, color: "#6E6A59", whiteSpace: "nowrap" }}>{statusHint(state.category, state, weekStart)}</span>
                <button onClick={() => onMarkBought(name)} aria-label={`${name}: net gekocht`} title="Net gekocht" style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 4 }}>
                  <RefreshCw size={15} />
                </button>
                <button onClick={() => onRemoveTracking(name)} aria-label={`${name}: stop bijhouden`} title="Stop bijhouden" style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", padding: 4 }}>
                  <Trash2 size={15} />
                </button>
              </div>
              <CategoryPicker value={state.category} onChange={(cat) => onUpdateCategory(name, cat)} />
              {!catDef && <p style={{ fontSize: 11.5, color: "#A75135", margin: "6px 0 0" }}>Onbekende categorie.</p>}
            </div>
          );
        })}

        {addingTrackName === null ? (
          <button
            onClick={() => setAddingTrackName("")}
            style={{ background: "none", border: "1px dashed #C9C2AE", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#5C7A5E", fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            + item bijhouden
          </button>
        ) : (
          <div style={{ border: "1px solid #C9C2AE", borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
            {!addingTrackName ? (
              <IngredientSearch ingredientNames={ingredientNames} placeholder="Zoek of typ een ingrediënt…" onPick={setAddingTrackName} />
            ) : (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }}>{addingTrackName}</p>
                <CategoryPicker value={addingTrackCategory} onChange={setAddingTrackCategory} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={handleConfirmTrack} style={{ flex: 1, background: "#5C7A5E", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                    Bijhouden
                  </button>
                  <button onClick={() => setAddingTrackName(null)} style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 8, padding: "8px 14px", fontSize: 13.5, cursor: "pointer" }}>
                    Annuleren
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
