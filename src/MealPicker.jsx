import { useState, useMemo, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { inputStyle } from "./styles.js";

// Searchable replacement for a native <select> of recipe names — with 50+
// recipes a plain OS picker in insertion order is unusable. Mirrors the
// existing ingredient-autocomplete pattern in RecipeForm.jsx (same Float
// shadow, same onMouseDown+preventDefault / delayed-onBlur pairing to avoid
// the blur-before-click race that pattern was already fixed for once).
export default function MealPicker({ recipes, onSelect, onCancel }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} color="#6E6A59" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(onCancel, 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && filtered.length > 0) onSelect(filtered[0].id);
          }}
          placeholder="Zoek een maaltijd…"
          aria-label="Zoek een maaltijd"
          style={{ ...inputStyle, marginTop: 0, width: "100%", paddingLeft: 30, fontSize: 14 }}
        />
      </div>
      {filtered.length > 0 ? (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 20,
          background: "#fff", border: "1px solid #C9C2AE", borderRadius: 7,
          boxShadow: "0 4px 10px rgba(35,40,35,0.12)", maxHeight: 260, overflowY: "auto",
        }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(r.id); }}
              style={{ padding: "8px 10px", fontSize: 13.5, cursor: "pointer" }}
            >
              {r.name}{r.suspended ? " (gepauzeerd)" : ""}
            </div>
          ))}
        </div>
      ) : query && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 20,
          background: "#fff", border: "1px solid #C9C2AE", borderRadius: 7,
          boxShadow: "0 4px 10px rgba(35,40,35,0.12)", padding: "8px 10px", fontSize: 13, color: "#6E6A59",
        }}>
          Geen recepten gevonden.
        </div>
      )}
    </div>
  );
}
