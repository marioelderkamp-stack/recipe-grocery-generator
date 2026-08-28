import { ArrowLeft, Leaf } from "lucide-react";
import { STORE_META, aggregateQuantities } from "./lib.js";

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
//
// No header bar on purpose: the tinted background already identifies the
// store, and every pixel of height here is worth more rows visible without
// scrolling. The back button floats fixed at the left edge instead, so it
// stays reachable as the list scrolls beneath it rather than eating a
// permanent row of height at the top.
export default function ShoppingMode({ storeId, items, checked, onToggle, onClose }) {
  const meta = STORE_META[storeId];
  return (
    <div style={{ minHeight: "100vh", background: meta.tint }}>
      <style>{`
        .shopping-items { padding-left: 44px; columns: 2; column-gap: 6px; }
        .shopping-row { display: flex; flex-direction: column; gap: clamp(0px, 0.15vh, 2px); padding: clamp(2px, 0.35vh, 5px) 12px; cursor: pointer; break-inside: avoid; -webkit-column-break-inside: avoid; }
        .shopping-row__name-wrap { display: flex; align-items: center; gap: 5px; min-width: 0; }
        .shopping-row + .shopping-row { border-top: 1px solid rgba(35,40,35,0.1); }
        .shopping-row__name { font-size: clamp(9px, 2.25vh, 19.5px); font-weight: 600; line-height: 1.1; overflow-wrap: break-word; }
        .shopping-row__qty { font-family: 'JetBrains Mono', monospace; font-size: clamp(5px, 1.3vh, 11px); color: #6E6A59; line-height: 1.1; }
        .shopping-row--checked .shopping-row__name { opacity: 0.4; text-decoration: line-through; }
        .shopping-row--checked .shopping-row__qty { opacity: 0.4; }
      `}</style>

      <button
        onClick={onClose}
        aria-label="Terug naar boodschappenlijst"
        style={{
          position: "fixed", left: 6, top: "50%", transform: "translateY(-50%)", zIndex: 10,
          width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#F7F5EE", border: `1px solid ${meta.border}`, cursor: "pointer", color: "#232823",
        }}
      >
        <ArrowLeft size={17} />
      </button>

      {items.length === 0 ? (
        <p style={{ padding: "24px 16px 24px 44px", fontSize: 14, color: "#6E6A59", fontStyle: "italic" }}>
          Niets meer te halen bij {meta.name}.
        </p>
      ) : (
        <div className="shopping-items">
          {items.map((item) => {
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
                <div className="shopping-row__name-wrap">
                  {item.bio && <Leaf size={11} color="#5C7A5E" strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                  <span className="shopping-row__name">{item.name}</span>
                </div>
                <span className="shopping-row__qty">{aggregateQuantities(item.qtys)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
