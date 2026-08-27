import { Check, Leaf, ListChecks } from "lucide-react";
import { STORE_META } from "./lib.js";

const modeLabelStyle = (active) => ({
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontSize: 14, fontWeight: 700, color: active ? "#232823" : "#6E6A59", whiteSpace: "nowrap",
});

export function GroceryModeSlider({ mode, setMode }) {
  const isTrips = mode === "trips";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 12,
      padding: "14px 16px", marginBottom: 14,
    }}>
      <button onClick={() => setMode("bio")} style={modeLabelStyle(!isTrips)}>
        Meeste bio
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={1}
        value={isTrips ? 1 : 0}
        onChange={(e) => setMode(e.target.value === "1" ? "trips" : "bio")}
        aria-label="Voorkeur: meeste bio of meest lidl"
        className="mode-slider"
        style={{ width: 96, flexShrink: 0 }}
      />
      <button onClick={() => setMode("trips")} style={modeLabelStyle(isTrips)}>
        Meest lidl
      </button>
    </div>
  );
}

export function StoreSection({ storeId, items, checked, onToggle, onShop }) {
  const meta = STORE_META[storeId];
  return (
    <div style={{ marginBottom: 14 }}>
      {onShop ? (
        <div style={{ display: "flex", height: 44, borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
          <div style={{
            flex: 2, minWidth: 0, display: "flex", alignItems: "center",
            padding: "0 12px", background: meta.labelBg,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#232823" }}>{meta.name}</span>
          </div>
          <button
            onClick={() => onShop(storeId)}
            style={{
              flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: meta.shopBtnBg, color: meta.shopBtnColor, border: "none", cursor: "pointer",
              fontSize: 13.5, fontWeight: 700, padding: "0 8px",
            }}
          >
            <ListChecks size={16} /> Afstreeplijstje
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5C5F52", marginBottom: 6 }}>{meta.name}</div>
      )}
      <div style={{ background: meta.tint, border: `1px solid ${meta.border}`, borderRadius: onShop ? "0 0 10px 10px" : 10, overflow: "hidden" }}>
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6E6A59" }}>
              {item.qtys.join(" + ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
