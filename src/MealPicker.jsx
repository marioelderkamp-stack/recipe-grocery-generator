import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { inputStyle } from "./styles.js";

// Full-screen recipe search — with 50+ recipes a plain OS <select> in
// insertion order is unusable. Sized to window.visualViewport rather than an
// inline dropdown: on Android the keyboard shrinks the visible viewport
// without moving anything else, so anchoring the results list to wherever
// the triggering day row sits on the page leaves it with almost no room.
// A full-screen sheet always gets the maximum space above the keyboard,
// regardless of scroll position.
export default function MealPicker({ recipes, currentRecipe, initialQuery, onSelect, onCancel }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [viewport, setViewport] = useState({ top: 0, height: window.innerHeight });
  const inputRef = useRef(null);

  // Cursor after whatever was already typed (handed off from a day's inline
  // search box), not reset to the start — continuing to type should append.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const recompute = () => {
      const vv = window.visualViewport;
      setViewport(vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight });
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

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Opened by tapping a day's already-assigned recipe (a swap, not a
    // first-time add): show just that recipe as the sole suggestion rather
    // than dumping the full list, until the user actually searches for
    // something else.
    if (!q && currentRecipe) return [currentRecipe];
    // Matches on ingredient name too (mirrors Recepten beheren's own search)
    // so "wat kan ik maken met andijvie" works as well as searching by title.
    return recipes
      .filter((r) => {
        if (!q) return true;
        const inName = r.name.toLowerCase().includes(q);
        const inIngredients = r.ingredients.some(([n]) => n.toLowerCase().includes(q));
        return inName || inIngredients;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query, currentRecipe]);

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, top: viewport.top, height: viewport.height, zIndex: 100,
      background: "#EEEBE2", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: 10,
        background: "#F7F5EE", borderBottom: "1px solid #C9C2AE", flexShrink: 0,
      }}>
        <button
          onClick={onCancel}
          aria-label="Annuleren"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#232823", padding: 6, display: "flex", flexShrink: 0 }}
        >
          <X size={20} />
        </button>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} color="#6E6A59" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) onSelect(filtered[0].id);
            }}
            placeholder="Zoek een maaltijd…"
            aria-label="Zoek een maaltijd"
            style={{ ...inputStyle, marginTop: 0, width: "100%", paddingLeft: 30, fontSize: 14 }}
          />
        </div>
      </div>
      {/* overscrollBehavior stops this list's own scroll from "chaining" into
          the calendar underneath once you hit the top or bottom — without
          it, a scroll gesture that runs out of list to scroll keeps going
          and scrolls the page behind this full-screen overlay instead. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", background: "#fff" }}>
        {filtered.length > 0 ? filtered.map((r) => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            style={{ padding: "12px 14px", fontSize: 14.5, cursor: "pointer", borderBottom: "1px solid #EEEBE2" }}
          >
            {r.name}{r.suspended ? " (gepauzeerd)" : ""}
          </div>
        )) : query && (
          <div style={{ padding: "12px 14px", fontSize: 13.5, color: "#6E6A59" }}>
            Geen recepten gevonden.
          </div>
        )}
      </div>
    </div>
  );
}
