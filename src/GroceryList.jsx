import { Check, Leaf, ArrowUpRight, Plus } from "lucide-react";
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

export function StoreSection({ storeId, items, checked, onToggle, onToggleSkip, onShop }) {
  const meta = STORE_META[storeId];
  return (
    <div style={{ marginBottom: 14 }}>
      {onShop ? (
        <div style={{
          display: "flex", alignItems: "stretch", height: 44,
          borderRadius: "10px 10px 0 0", overflow: "hidden", background: meta.labelBg,
        }}>
          <div style={{
            flex: 2, minWidth: 0, display: "flex", alignItems: "center",
            padding: "0 12px",
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#232823" }}>{meta.name}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: "6px 8px 6px 4px" }}>
            <button
              onClick={() => onShop(storeId)}
              style={{
                width: "100%", height: "100%", minWidth: 0, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 5, borderRadius: 8,
                background: meta.shopBtnBg, color: meta.shopBtnColor,
                border: "1.5px solid rgba(0,0,0,0.2)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "0 6px",
              }}
            >
              Afstreeplijstje <ArrowUpRight size={15} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5C5F52", marginBottom: 6 }}>{meta.name}</div>
      )}
      <div style={{ background: meta.tint, border: `1px solid ${meta.border}`, borderRadius: onShop ? "0 0 10px 10px" : 10, overflow: "hidden" }}>
        {items.map((item, i) => {
          const isSkipped = !!item.skipped;
          const isChecked = !!checked[item.name];
          const handleTap = () => (isSkipped ? onToggleSkip(item.name) : onToggle(item.name));
          return (
            <div
              key={item.name}
              className="check-row"
              onClick={handleTap}
              role="checkbox"
              tabIndex={0}
              aria-checked={isSkipped ? false : isChecked}
              title={isSkipped ? "Voorraad-inschatting: waarschijnlijk nog aanwezig — tik om toch toe te voegen" : undefined}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTap(); } }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                borderBottom: i < items.length - 1 ? "1px solid rgba(35,40,35,0.08)" : "none",
                cursor: "pointer", opacity: isSkipped ? 0.55 : isChecked ? 0.45 : 1,
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: isSkipped ? "1.5px dashed #6E6A59" : "1.5px solid #5C7A5E",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isChecked ? "#5C7A5E" : "transparent",
              }}>
                {isSkipped ? <Plus size={12} color="#6E6A59" /> : isChecked && <Check size={13} color="#fff" />}
              </span>
              <Leaf size={14} color={item.bio ? "#5C7A5E" : "#B9B29C"} strokeWidth={item.bio ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14.5, textDecoration: isSkipped || isChecked ? "line-through" : "none" }}>{item.name}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6E6A59" }}>
                {item.qtys.join(" + ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
