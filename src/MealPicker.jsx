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
  const [maxListHeight, setMaxListHeight] = useState(260);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // On Android, focusing the input shrinks window.visualViewport (the on-screen
  // keyboard overlays the rest) without moving the input, so a fixed maxHeight
  // routinely runs the list under the keyboard. Recompute against the actual
  // visible space below the input whenever the viewport changes.
  useEffect(() => {
    const recompute = () => {
      if (!inputRef.current) return;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const available = visibleBottom - inputRef.current.getBoundingClientRect().bottom - 8;
      setMaxListHeight(Math.max(90, Math.min(260, available)));
    };
    recompute();
    window.visualViewport?.addEventListener("resize", recompute);
    window.visualViewport?.addEventListener("scroll", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.visualViewport?.removeEventListener("resize", recompute);
      window.visualViewport?.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

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
          boxShadow: "0 4px 10px rgba(35,40,35,0.12)", maxHeight: maxListHeight, overflowY: "auto",
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
