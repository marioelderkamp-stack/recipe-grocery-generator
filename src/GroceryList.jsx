import { Check, Leaf, ArrowUpRight } from "lucide-react";
import { STORE_META, aggregateQuantities } from "./lib.js";

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

// A single tappable ingredient row: checkbox, optional bio leaf (only shown
// when the item carries a bio flag — Lijst has no store context so omits
// it), name (strikethrough when checked), quantity. Shared by StoreSection
// (grouped per store) and the column layout in the Lijst tab in App.jsx.
// "stacked" (Lijst's narrower columns) puts the quantity on its own line
// below the name, matching the afstreeplijstje pop-out; the default lays
// the quantity out to the right on one line, for Winkel's wider rows.
export function CheckRow({ item, checked, onToggle, last, stacked }) {
  const isChecked = !!checked[item.name];
  const checkbox = (
    <span style={{
      width: stacked ? 15 : 18, height: stacked ? 15 : 18, borderRadius: 4, border: "1.5px solid #5C7A5E", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: isChecked ? "#5C7A5E" : "transparent",
    }}>
      {isChecked && <Check size={stacked ? 10 : 13} color="#fff" />}
    </span>
  );
  const rowProps = {
    className: "check-row",
    onClick: () => onToggle(item.name),
    role: "checkbox",
    tabIndex: 0,
    "aria-checked": isChecked,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(item.name); } },
  };

  if (stacked) {
    return (
      <div
        {...rowProps}
        style={{
          padding: "8px 10px",
          borderBottom: last ? "none" : "1px solid rgba(35,40,35,0.08)",
          cursor: "pointer", opacity: isChecked ? 0.45 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {checkbox}
          {item.bio != null && (
            <Leaf size={11} color={item.bio ? "#5C7A5E" : "#B9B29C"} strokeWidth={item.bio ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
          )}
          <span style={{
            flex: 1, minWidth: 0, fontSize: 12.5, textDecoration: isChecked ? "line-through" : "none",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip",
          }}>
            {item.name}
          </span>
        </div>
        {item.qtys.length > 0 && (
          <span style={{
            display: "block", marginLeft: 21, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5, color: "#6E6A59",
          }}>
            {aggregateQuantities(item.qtys)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      {...rowProps}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
        borderBottom: last ? "none" : "1px solid rgba(35,40,35,0.08)",
        cursor: "pointer", opacity: isChecked ? 0.45 : 1,
      }}
    >
      {checkbox}
      {item.bio != null && (
        <Leaf size={14} color={item.bio ? "#5C7A5E" : "#B9B29C"} strokeWidth={item.bio ? 2.5 : 1.75} style={{ flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, fontSize: 14.5, textDecoration: isChecked ? "line-through" : "none" }}>{item.name}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#6E6A59" }}>
        {aggregateQuantities(item.qtys)}
      </span>
    </div>
  );
}

// One of the Lijst tab's three columns (Ingrediënten / Gebruikelijk /
// Suggesties) — a titled, tinted box of stacked CheckRows.
export function ListColumn({ title, items, checked, onToggle }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#5C5F52", textTransform: "uppercase", letterSpacing: 0.3,
        marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip",
      }}>
        {title}
      </div>
      <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, overflow: "hidden" }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, padding: "10px 8px", fontSize: 11, color: "#9A957F", fontStyle: "italic" }}>Geen items</p>
        ) : (
          items.map(([name, qtys], i) => (
            <CheckRow key={name} item={{ name, qtys }} checked={checked} onToggle={onToggle} last={i === items.length - 1} stacked />
          ))
        )}
      </div>
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
