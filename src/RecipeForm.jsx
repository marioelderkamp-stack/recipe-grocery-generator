import { Plus, X } from "lucide-react";
import { TAGS } from "./data.js";
import { labelStyle, inputStyle, generateBtnStyle, navBtnStyle } from "./styles.js";

export default function RecipeForm({ draft, setDraft, onSave, onCancel }) {
  const updateIngredient = (i, field, val) => {
    const next = draft.ingredients.map((ing, idx) => (idx === i ? [field === "name" ? val : ing[0], field === "qty" ? val : ing[1]] : ing));
    setDraft({ ...draft, ingredients: next });
  };
  const addRow = () => setDraft({ ...draft, ingredients: [...draft.ingredients, ["", ""]] });
  const removeRow = (i) => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, idx) => idx !== i) });

  return (
    <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 14px" }}>
        {draft.id ? "Recept bewerken" : "Nieuw recept"}
      </h3>
      <label style={labelStyle}>Naam van het gerecht</label>
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="bijv. Groentesoep"
        style={inputStyle}
      />

      <label style={{ ...labelStyle, marginTop: 12 }}>Categorie</label>
      <div style={{ display: "flex", gap: 8 }}>
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

      <label style={{ ...labelStyle, marginTop: 14 }}>Ingrediënten <span style={{ fontWeight: 400, color: "#8A8570" }}>(voor 6 personen)</span></label>
      {draft.ingredients.map((ing, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            value={ing[0]}
            onChange={(e) => updateIngredient(i, "name", e.target.value)}
            placeholder="ingrediënt"
            style={{ ...inputStyle, flex: 2, marginTop: 0 }}
          />
          <input
            value={ing[1]}
            onChange={(e) => updateIngredient(i, "qty", e.target.value)}
            placeholder="hoeveelheid"
            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
          />
          <button onClick={() => removeRow(i)} aria-label="Regel verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", padding: "0 4px" }}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button onClick={addRow} className="link-btn" style={{ background: "none", border: "none", color: "#5C7A5E", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginTop: 4, padding: "4px 0" }}>
        <Plus size={14} /> Ingrediënt toevoegen
      </button>

      <label style={{ ...labelStyle, marginTop: 14 }}>Bereidingswijze</label>
      <textarea
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
