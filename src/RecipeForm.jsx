import { useState } from "react";
import { Plus, X } from "lucide-react";
import { TAGS } from "./data.js";
import { labelStyle, inputStyle, generateBtnStyle, navBtnStyle } from "./styles.js";

const MAX_SUGGESTIONS = 6;

export default function RecipeForm({ draft, setDraft, onSave, onCancel, ingredientNames = [] }) {
  const [suggestFor, setSuggestFor] = useState(null);

  const updateIngredient = (i, field, val) => {
    const next = draft.ingredients.map((ing, idx) => (idx === i ? [field === "name" ? val : ing[0], field === "qty" ? val : ing[1]] : ing));
    setDraft({ ...draft, ingredients: next });
  };
  const addRow = () => setDraft({ ...draft, ingredients: [...draft.ingredients, ["", ""]] });
  const removeRow = (i) => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, idx) => idx !== i) });

  const suggestionsFor = (value) => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return ingredientNames
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, MAX_SUGGESTIONS);
  };

  return (
    <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 14px" }}>
        {draft.id ? "Recept bewerken" : "Nieuw recept"}
      </h3>
      <label htmlFor="recipe-name" style={labelStyle}>Naam van het gerecht</label>
      <input
        id="recipe-name"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="bijv. Groentesoep"
        style={inputStyle}
      />

      <label htmlFor="recipe-prep-minutes" style={{ ...labelStyle, marginTop: 12 }}>Bereidingstijd (minuten)</label>
      <input
        id="recipe-prep-minutes"
        type="number"
        min="1"
        value={draft.prepMinutes}
        onChange={(e) => setDraft({ ...draft, prepMinutes: e.target.value })}
        placeholder="bijv. 30"
        style={inputStyle}
      />

      <label id="recipe-category-label" style={{ ...labelStyle, marginTop: 12 }}>Categorie</label>
      <div role="group" aria-labelledby="recipe-category-label" style={{ display: "flex", gap: 8 }}>
        {TAGS.map((t) => (
          <button
            key={t.id}
            onClick={() => setDraft({ ...draft, tag: t.id })}
            style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: draft.tag === t.id ? `1.5px solid ${t.color}` : "1.5px solid #C9C2AE",
              background: draft.tag === t.id ? `${t.color}22` : "#fff",
              color: draft.tag === t.id ? t.color : "#5C5F52", fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label id="recipe-ingredients-label" style={{ ...labelStyle, marginTop: 14 }}>Ingrediënten <span style={{ fontWeight: 400, color: "#6E6A59" }}>(voor 6 personen)</span></label>
      <div role="group" aria-labelledby="recipe-ingredients-label">
        {draft.ingredients.map((ing, i) => {
          const suggestions = suggestFor === i ? suggestionsFor(ing[0]) : [];
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <div style={{ position: "relative", flex: 2 }}>
                <input
                  value={ing[0]}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  onFocus={() => setSuggestFor(i)}
                  onBlur={() => setTimeout(() => setSuggestFor((cur) => (cur === i ? null : cur)), 120)}
                  placeholder="ingrediënt"
                  aria-label="Ingrediënt naam"
                  style={{ ...inputStyle, marginTop: 0, width: "100%" }}
                />
                {suggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 10,
                    background: "#fff", border: "1px solid #C9C2AE", borderRadius: 7,
                    boxShadow: "0 4px 10px rgba(35,40,35,0.12)", overflow: "hidden",
                  }}>
                    {suggestions.map((name) => (
                      <div
                        key={name}
                        onMouseDown={(e) => { e.preventDefault(); updateIngredient(i, "name", name); setSuggestFor(null); }}
                        style={{ padding: "7px 10px", fontSize: 13.5, cursor: "pointer" }}
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={ing[1]}
                onChange={(e) => updateIngredient(i, "qty", e.target.value)}
                placeholder="hoeveelheid"
                aria-label="Hoeveelheid"
                style={{ ...inputStyle, flex: 1, marginTop: 0 }}
              />
              <button onClick={() => removeRow(i)} aria-label="Regel verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", padding: "0 4px" }}>
                <X size={16} />
              </button>
            </div>
          );
        })}
        <button onClick={addRow} className="link-btn" style={{ background: "none", border: "none", color: "#5C7A5E", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginTop: 4, padding: "4px 0" }}>
          <Plus size={14} /> Ingrediënt toevoegen
        </button>
      </div>

      <label htmlFor="recipe-instructions" style={{ ...labelStyle, marginTop: 14 }}>Bereidingswijze</label>
      <textarea
        id="recipe-instructions"
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        placeholder="Beschrijf de bereiding stap voor stap…"
        rows={4}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={() => onSave(draft)} style={{ ...generateBtnStyle, background: "#5C7A5E", flex: 1 }}>
          Recept opslaan
        </button>
        <button onClick={onCancel} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
