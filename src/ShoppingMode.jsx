import { ArrowLeft, Leaf } from "lucide-react";
import { STORE_META } from "./lib.js";

// A distraction-free, full-screen "in the store" view: one supermarket's
// still-to-buy items, nothing else — no header, tabs, or other chrome. Meant
// to sit in a small split-screen pane next to a store's own app (e.g. Lidl's
// Scan&Go), so text size is intentionally viewport-relative (vh-based
// clamp()) rather than fixed: shrinking or growing the split gives smaller
// or larger text automatically, without needing any setting.
//
// Tapping an item toggles the same checked/persisted state as the main
// grocery list (onToggle is the App-level toggleCheck) — it only dims and
// strikes through in place, it never disappears from this list. The list
// itself is a snapshot taken once, when the store's button is tapped (see
// App.jsx), of whatever wasn't already checked at that moment; that's what
// "already in stock" filtering means here, not a live filter.
export default function ShoppingMode({ storeId, items, checked, onToggle, onClose }) {
  const meta = STORE_META[storeId];
  return (
    <div style={{ minHeight: "100vh", background: meta.tint, display: "flex", flexDirection: "column" }}>
      <style>{`
        .shopping-row { display: flex; flex-direction: column; justify-content: center; gap: clamp(2px, 0.8vh, 8px); padding: clamp(10px, 2.2vh, 22px) 16px; cursor: pointer; }
        .shopping-row + .shopping-row { border-top: 1px solid rgba(35,40,35,0.1); }
        .shopping-row__name { font-size: clamp(17px, 4.6vh, 38px); font-weight: 600; line-height: 1.2; overflow-wrap: break-word; }
        .shopping-row__qty { font-family: 'JetBrains Mono', monospace; font-size: clamp(11px, 2.2vh, 20px); color: #6E6A59; }
        .shopping-row--checked .shopping-row__name { opacity: 0.4; text-decoration: line-through; }
        .shopping-row--checked .shopping-row__qty { opacity: 0.4; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 4px", background: "#F7F5EE", borderBottom: `1px solid ${meta.border}`, flexShrink: 0 }}>
        <button
          onClick={onClose}
          aria-label="Terug naar boodschappenlijst"
          style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#232823" }}
        >
          <ArrowLeft size={22} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#232823" }}>{meta.name}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {items.length === 0 ? (
          <p style={{ padding: "24px 16px", fontSize: 14, color: "#6E6A59", fontStyle: "italic" }}>
            Niets meer te halen bij {meta.name}.
          </p>
        ) : (
          items.map((item) => {
            const isChecked = !!checked[item.name];
            return (
              <div
                key={item.name}
                className={`shopping-row${isChecked ? " shopping-row--checked" : ""}`}
                onClick={() => onToggle(item.name)}
                role="checkbox"
                tabIndex={0}
                aria-checked={isChecked}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(item.name); } }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.bio && <Leaf size={14} color="#5C7A5E" strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                  <span className="shopping-row__name">{item.name}</span>
                </div>
                <span className="shopping-row__qty">{item.qtys.join(" + ")}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
