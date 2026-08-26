import { useState, useMemo } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { TAGS } from "./data.js";
import { tagColor } from "./lib.js";
import { generateBtnStyle, navBtnStyle, inputStyle } from "./styles.js";
import Modal from "./Modal.jsx";
import RecipeForm from "./RecipeForm.jsx";

export default function RecipeManager({ recipes, editing, setEditing, onAdd, onUpdate, onRemove, onClose, ingredientNames }) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const startNew = () => setEditing({ name: "", tag: "veg", ingredients: [["", ""]], instructions: "", prepMinutes: "" });
  const startEdit = (r) => setEditing({ id: r.id, name: r.name, tag: r.tag, instructions: r.instructions, prepMinutes: r.prepMinutes ? String(r.prepMinutes) : "", ingredients: r.ingredients.map(([n, q]) => [n, q]) });
  const handleSave = (draft) => (draft.id ? onUpdate(draft.id, draft) : onAdd(draft));

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => {
        if (tagFilter !== "all" && r.tag !== tagFilter) return false;
        if (!q) return true;
        const inName = r.name.toLowerCase().includes(q);
        const inIngredients = r.ingredients.some(([n]) => n.toLowerCase().includes(q));
        return inName || inIngredients;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query, tagFilter]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21, margin: 0 }}>Recepten beheren</h2>
        <button className="ledger-btn link-btn" onClick={onClose} style={{ background: "none", border: "none", fontSize: 13, color: "#5C7A5E", cursor: "pointer", fontWeight: 600 }}>
          Terug naar planning
        </button>
      </div>

      {!editing && (
        <button className="ledger-btn" onClick={startNew} style={{ ...generateBtnStyle, background: "#5C7A5E", marginBottom: 20 }}>
          <Plus size={16} /> Nieuw recept toevoegen
        </button>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <RecipeForm draft={editing} setDraft={setEditing} onSave={handleSave} onCancel={() => setEditing(null)} ingredientNames={ingredientNames} />
        </Modal>
      )}

      {!editing && recipes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} color="#8A8570" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam of ingrediënt…"
              aria-label="Zoek recepten"
              style={{ ...inputStyle, marginTop: 0, paddingLeft: 32 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setTagFilter("all")}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: tagFilter === "all" ? "1.5px solid #232823" : "1.5px solid #C9C2AE",
                background: tagFilter === "all" ? "#23282322" : "#fff",
                color: tagFilter === "all" ? "#232823" : "#5C5F52", fontWeight: 600,
              }}
            >
              Alle
            </button>
            {TAGS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTagFilter(t.id)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                  border: tagFilter === t.id ? `1.5px solid ${t.color}` : "1.5px solid #C9C2AE",
                  background: tagFilter === t.id ? `${t.color}22` : "#fff",
                  color: tagFilter === t.id ? t.color : "#5C5F52", fontWeight: 600,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid #C9C2AE" }}>
        {recipes.length === 0 && (
          <p style={{ fontSize: 13, color: "#8A8570", padding: "16px 4px" }}>Nog geen recepten. Voeg er hierboven een toe.</p>
        )}
        {recipes.length > 0 && filteredRecipes.length === 0 && (
          <p style={{ fontSize: 13, color: "#8A8570", padding: "16px 4px" }}>Geen recepten gevonden voor deze zoekopdracht.</p>
        )}
        {filteredRecipes.map((r) => (
          <div key={r.id} style={{ padding: "13px 4px", borderBottom: "1px solid #C9C2AE" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: tagColor(r.tag), flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{r.name}</span>
              {r.suspended && (
                <span style={{ fontSize: 11.5, color: "#B5583A", fontWeight: 700 }}>Gepauzeerd</span>
              )}
              {r.prepMinutes && (
                <span style={{ fontSize: 11.5, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace" }}>{r.prepMinutes} min</span>
              )}
              <button onClick={() => startEdit(r)} aria-label={`${r.name} bewerken`} style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 4 }}>
                <Pencil size={15} />
              </button>
              <button onClick={() => setConfirmDelete(r)} aria-label={`${r.name} verwijderen`} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </div>
            <div style={{ marginLeft: 17, marginTop: 4, fontSize: 12.5, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace" }}>
              {r.ingredients.map(([n, q]) => `${n} ${q}`).join(" · ")}
            </div>
            {r.instructions && (
              <div style={{ marginLeft: 17, marginTop: 6, fontSize: 12.5, color: "#4A4E42", lineHeight: 1.5 }}>
                {r.instructions}
              </div>
            )}
          </div>
        ))}
      </div>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>
              Recept verwijderen?
            </h3>
            <p style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.5, margin: "0 0 18px" }}>
              Weet je zeker dat je <strong>{confirmDelete.name}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { onRemove(confirmDelete.id); setConfirmDelete(null); }}
                style={{ ...generateBtnStyle, background: "#B5583A", flex: 1 }}
              >
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
