import { Check, Leaf, ArrowUpRight } from "lucide-react";
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

// A single tappable ingredient row: leading indicator, optional bio leaf
// (only shown when the item carries a bio flag — Lijst has no store context
// so omits it), name (strikethrough when checked), quantity. Shared by
// StoreSection (grouped per store) and the flat, store-agnostic Lijst tab
// in App.jsx.
//
// variant="checkbox" (default, used by Winkel/StoreSection while actively
// shopping): a plain checkbox — tick it once you've picked the item up.
// variant="stock" (used by Lijst): a labeled "Heb ik al" pill instead of a
// checkbox. Same underlying toggle, but Lijst isn't a shopping-progress
// checklist — it's where you flag what you already have at home before
// shopping, and a bare checkbox there reads as "tick to add," backwards
// from its actual effect (ticking removes the item from Winkel).
export function CheckRow({ item, checked, onToggle, last, variant = "checkbox" }) {
  const isChecked = !!checked[item.name];
  return (
    <div
      className="check-row"
      onClick={() => onToggle(item.name)}
      role="checkbox"
      tabIndex={0}
      aria-checked={isChecked}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(item.name); } }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
        borderBottom: last ? "none" : "1px solid rgba(35,40,35,0.08)",
        cursor: "pointer", opacity: variant === "checkbox" && isChecked ? 0.45 : 1,
      }}
    >
      {variant === "checkbox" && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, border: "1.5px solid #5C7A5E", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isChecked ? "#5C7A5E" : "transparent",
        }}>
          {isChecked && <Check size={13} color="#fff" />}
        </span>
      )}
      {item.bio != null && (
        <Leaf size={14} color={item.bio ? "#5C7A5E" : "#B9B29C"} strokeWidth={item.bio ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, fontSize: 14.5, textDecoration: isChecked ? "line-through" : "none", opacity: variant === "stock" && isChecked ? 0.5 : 1 }}>{item.name}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6E6A59" }}>
        {item.qtys.join(" + ")}
      </span>
      {variant === "stock" && (
        <span
          aria-hidden="true"
          style={{
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            border: isChecked ? "1px solid #5C7A5E" : "1px solid #C9C2AE",
            background: isChecked ? "#5C7A5E" : "#fff", color: isChecked ? "#fff" : "#6E6A59",
          }}
        >
          {isChecked && <Check size={11} />}
          {isChecked ? "Al in huis" : "Heb ik al"}
        </span>
      )}
    </div>
  );
}

export function StoreSection({ storeId, items, checked, onToggle, onShop }) {
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
                border: "1.5px solid rgba(35,40,35,0.2)", boxShadow: "0 1px 3px rgba(35,40,35,0.3)",
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
        {items.map((item, i) => (
          <CheckRow key={item.name} item={item} checked={checked} onToggle={onToggle} last={i === items.length - 1} />
        ))}
      </div>
    </div>
  );
}
