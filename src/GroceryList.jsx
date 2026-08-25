import { Check, Leaf } from "lucide-react";
import { STORE_ORDER, STORE_META } from "./lib.js";

export function GroceryModeSlider({ mode, setMode }) {
  const isTrips = mode === "trips";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 12,
      padding: "14px 16px", marginBottom: 14,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: isTrips ? "#8A8570" : "#232823", whiteSpace: "nowrap" }}>
        Meeste bio
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={1}
        value={isTrips ? 1 : 0}
        onChange={(e) => setMode(e.target.value === "1" ? "trips" : "bio")}
        aria-label="Voorkeur: meeste bio of minste ritjes"
        className="mode-slider"
        style={{ width: 96, flexShrink: 0 }}
      />
      <span style={{ fontSize: 14, fontWeight: 700, color: isTrips ? "#232823" : "#8A8570", whiteSpace: "nowrap" }}>
        Minste ritjes
      </span>
    </div>
  );
}

export function GroceryStoreSummary({ byStore }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      {[...STORE_ORDER, "other"].map((id) => {
        const items = byStore[id];
        if (items.length === 0) return null;
        const meta = STORE_META[id];
        const bioCount = items.filter((x) => x.bio).length;
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: meta.tint, border: `1px solid ${meta.border}` }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.name}</span>
            <span style={{ fontSize: 12.5, color: "#5C5F52" }}>
              {items.length} product{items.length === 1 ? "" : "en"}
              {id !== "other" ? ` (${bioCount} bio)` : " zonder winkelgegevens"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StoreSection({ storeId, items, checked, onToggle }) {
  const meta = STORE_META[storeId];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5C5F52", marginBottom: 6 }}>{meta.name}</div>
      <div style={{ background: meta.tint, border: `1px solid ${meta.border}`, borderRadius: 10, overflow: "hidden" }}>
        {items.map((item, i) => (
          <div
            key={item.name}
            className="check-row"
            onClick={() => onToggle(item.name)}
            role="checkbox"
            tabIndex={0}
            aria-checked={!!checked[item.name]}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(item.name); } }}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              borderBottom: i < items.length - 1 ? "1px solid rgba(35,40,35,0.08)" : "none",
              cursor: "pointer", opacity: checked[item.name] ? 0.45 : 1,
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 4, border: "1.5px solid #5C7A5E", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: checked[item.name] ? "#5C7A5E" : "transparent",
            }}>
              {checked[item.name] && <Check size={13} color="#fff" />}
            </span>
            <Leaf size={14} color={item.bio ? "#5C7A5E" : "#B9B29C"} strokeWidth={item.bio ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14.5, textDecoration: checked[item.name] ? "line-through" : "none" }}>{item.name}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#8A8570" }}>
              {item.qtys.join(" + ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
