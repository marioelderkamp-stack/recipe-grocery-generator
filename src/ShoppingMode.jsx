import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Leaf } from "lucide-react";
import { STORE_META, aggregateQuantities } from "./lib.js";

// A distraction-free, full-screen "in the store" view: one supermarket's
// still-to-buy items, nothing else — no header, tabs, or other chrome. Meant
// to sit in a small split-screen pane next to a store's own app (e.g. Lidl's
// Scan&Go). Text size is computed, not fixed: it's set so the list fills
// whatever height is actually available (tracked live via ResizeObserver, so
// resizing the split adjusts it too) with no scrolling — a short list gets
// big, easy-to-read text, a long list shrinks to still fit without a scroll.
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
// Reused canvas for text-width measurement (see nameSize below) — one
// offscreen canvas is plenty, no need to recreate it per render.
let measureCanvas = null;
function measureTextWidth(text, fontPx) {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  return ctx.measureText(text).width;
}

export default function ShoppingMode({ storeId, items, checked, onToggle, onClose }) {
  const meta = STORE_META[storeId];
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A two-column layout only earns its keep once there are enough items to
  // fill it — for a handful of items it just halves the available width for
  // no benefit, capping how large the text can get regardless of how much
  // vertical room is free. So column count itself scales with the list.
  const numColumns = items.length <= 4 ? 1 : 2;

  // Name size is the smaller of two independent fits, so a short list gets
  // dramatically large text without a long word blowing past its column:
  // - height fit: the browser balances column heights to near-equal on its
  //   own, so rows-per-column is just the divisor for "how much vertical
  //   room does one row get."
  // - width fit: measured against the single longest word across all items
  //   (not the longest full name) — a multi-word name can still wrap onto
  //   its own second line, it's one unbroken word overflowing sideways that
  //   actually needs a smaller font.
  const rowsPerColumn = Math.max(1, Math.ceil(items.length / numColumns));
  const heightSlot = containerSize.height / rowsPerColumn;
  const heightFitName = heightSlot * 0.5;

  const colGapTotal = (numColumns - 1) * 6;
  const colWidth = Math.max(40, (containerSize.width - 44 - colGapTotal) / numColumns - 24);
  const longestWord = items.reduce((longest, item) => {
    const word = item.name.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
    return word.length > longest.length ? word : longest;
  }, "");
  const refPx = 100;
  const widthFitName = longestWord ? (colWidth / measureTextWidth(longestWord, refPx)) * refPx : heightFitName;

  const nameSize = Math.min(Math.max(Math.min(heightFitName, widthFitName), 10), 200);
  const qtySize = Math.min(Math.max(nameSize * 0.5, 6), 26);

  // Split into columns (not CSS `columns`, which packs content to the top of
  // each column and dumps every bit of leftover room at the bottom) — each
  // column is its own flex column with the items spread evenly across the
  // full height, so a short list visibly fills the screen through generous
  // spacing even where bigger text alone hits its width ceiling first.
  const columns = Array.from({ length: numColumns }, () => []);
  items.forEach((item, i) => columns[Math.min(Math.floor(i / rowsPerColumn), numColumns - 1)].push(item));

  return (
    <div style={{
      height: "100vh", boxSizing: "border-box", padding: 6, overflow: "hidden",
      background: `repeating-linear-gradient(45deg, ${meta.border} 0 7px, #F7F5EE 7px 14px)`,
    }}>
      <div
        ref={containerRef}
        style={{
          height: "100%", borderRadius: 10, overflow: "hidden", position: "relative",
          // meta.tint is semi-transparent by design (meant to sit over a plain
          // page background) — layered as a background-image over a solid
          // base so it stays opaque here and actually masks the striped
          // border behind it, instead of letting the stripes bleed through.
          backgroundColor: "#F7F5EE", backgroundImage: `linear-gradient(${meta.tint}, ${meta.tint})`,
        }}
      >
        <style>{`
          .shopping-row { display: flex; flex-direction: column; gap: 1px; padding: 2px 12px; cursor: pointer; }
          .shopping-row__name-wrap { display: flex; align-items: center; gap: 5px; min-width: 0; }
          .shopping-row__name { font-size: ${nameSize}px; font-weight: 600; line-height: 1.1; overflow-wrap: break-word; }
          .shopping-row__qty { font-family: 'JetBrains Mono', monospace; font-size: ${qtySize}px; color: #6E6A59; line-height: 1.1; }
          .shopping-row--checked .shopping-row__name { opacity: 0.4; text-decoration: line-through; }
          .shopping-row--checked .shopping-row__qty { opacity: 0.4; }
        `}</style>

        <button
          onClick={onClose}
          aria-label="Terug naar boodschappenlijst"
          style={{
            position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", zIndex: 10,
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
          <div style={{ display: "flex", height: "100%", paddingLeft: 44, boxSizing: "border-box" }}>
            {columns.map((colItems, ci) => (
              <div
                key={ci}
                style={{
                  flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-evenly",
                  borderLeft: ci > 0 ? "1px solid rgba(35,40,35,0.1)" : "none",
                }}
              >
                {colItems.map((item) => {
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
                        {item.bio && <Leaf size={Math.min(Math.max(nameSize * 0.6, 9), 22)} color="#5C7A5E" strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                        <span className="shopping-row__name">{item.name}</span>
                      </div>
                      <span className="shopping-row__qty">{aggregateQuantities(item.qtys)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
