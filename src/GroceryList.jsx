import { Check, Leaf, ArrowUpRight, House, X } from "lucide-react";
import { STORE_META, STORE_ORDER, AISLE_ORDER, AISLE_LABELS, aggregateQuantities } from "./lib.js";
import { inputStyle } from "./styles.js";

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
// StoreSection (grouped per store) and the column layout in the Lijst tab
// in App.jsx. "stacked" (Lijst's narrower columns) puts the quantity on its
// own line below the name, matching the afstreeplijstje pop-out; the
// default lays the quantity out to the right on one line, for Winkel's
// wider rows.
//
// The leading indicator differs by mode, not just size: Winkel (default,
// !stacked) uses a plain checkbox — tick it once you've picked the item up,
// a real persisted "bought" action. Lijst (stacked) uses a small house
// badge instead, for its separate, local-only "groomed" state (see the
// comment on `groomed` in App.jsx) — a checkbox there would read as the
// same "tick to add/confirm" action as Winkel's, when it actually means
// the opposite ("I already have this, skip it").
export function CheckRow({ item, checked, onToggle, last, stacked }) {
  const isChecked = !!checked[item.name];
  const checkbox = (
    <span style={{
      width: 18, height: 18, borderRadius: 4, border: "1.5px solid #5C7A5E", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: isChecked ? "#5C7A5E" : "transparent",
    }}>
      {isChecked && <Check size={13} color="#fff" />}
    </span>
  );
  const stockBadge = (
    <span style={{
      width: 15, height: 15, borderRadius: "50%", border: "1.5px solid #5C7A5E", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: isChecked ? "#5C7A5E" : "transparent",
    }}>
      <House size={9} color={isChecked ? "#fff" : "#5C7A5E"} strokeWidth={2.5} />
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
          {stockBadge}
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

const EXTRA_STORE_LABEL = { lidl: "L", ah: "AH", ekoplaza: "E" };

// Same visual language as Ingrediënten beheer's per-store badges, but
// read-only — Lijst is not where availability gets edited, this is just
// showing what's already on file for a Zelf toegevoegd item.
function StoreBadge({ storeId, status }) {
  const meta = STORE_META[storeId];
  const bio = status === "bio";
  const nonBio = status === "non_bio_only";
  return (
    <span
      title={`${meta.name}: ${bio ? "bio" : nonBio ? "niet-bio" : "niet verkrijgbaar / onbekend"}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
        minWidth: 22, height: 20, borderRadius: 5, padding: "0 5px",
        fontSize: 9.5, fontWeight: 700, lineHeight: 1, flexShrink: 0,
        background: bio ? meta.border : "transparent",
        border: `1.5px solid ${bio ? meta.border : nonBio ? meta.border : "#D8D3C2"}`,
        color: bio ? "#fff" : nonBio ? meta.border : "#B9B29C",
      }}
    >
      {EXTRA_STORE_LABEL[storeId]}
    </span>
  );
}

// Winkels badge cycle for a still-pending item: unset (optional, the
// default) -> bio -> non_bio_only -> not_available -> back to unset. Mirrors
// Ingrediënten beheer's STATUS_CYCLE, but loops back to "no info" instead of
// stopping at not_available, since setting this is optional here.
const PENDING_STATUS_CYCLE = ["bio", "non_bio_only", "not_available"];
function nextPendingStatus(current) {
  const idx = PENDING_STATUS_CYCLE.indexOf(current);
  return idx === -1 ? PENDING_STATUS_CYCLE[0] : idx === PENDING_STATUS_CYCLE.length - 1 ? null : PENDING_STATUS_CYCLE[idx + 1];
}

// Same visual language as StoreBadge, but tappable — cycles through
// bio/niet-bio/niet verkrijgbaar/onbekend on each tap, for a pending item's
// optional Winkels info.
function EditableStoreBadge({ storeId, status, onClick }) {
  const meta = STORE_META[storeId];
  const bio = status === "bio";
  const nonBio = status === "non_bio_only";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${meta.name}: ${bio ? "bio" : nonBio ? "niet-bio" : status === "not_available" ? "niet verkrijgbaar" : "onbekend"} — tik om te wijzigen`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
        minWidth: 24, height: 22, borderRadius: 5, padding: "0 5px", cursor: "pointer",
        fontSize: 9.5, fontWeight: 700, lineHeight: 1, flexShrink: 0,
        background: bio ? meta.border : "transparent",
        border: `1.5px solid ${bio ? meta.border : nonBio || status === "not_available" ? meta.border : "#D8D3C2"}`,
        color: bio ? "#fff" : nonBio || status === "not_available" ? meta.border : "#B9B29C",
      }}
    >
      {EXTRA_STORE_LABEL[storeId]}
    </button>
  );
}

// The small thick "nieuw" chip that marks a not-yet-confirmed Zelf
// toegevoegd row, top-right of its (editable) name.
function NewBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", top: -7, right: -4, background: "#5C7A5E", color: "#fff",
        fontSize: 8.5, fontWeight: 800, letterSpacing: 0.4, lineHeight: 1, padding: "2.5px 5px",
        borderRadius: 4, textTransform: "uppercase", pointerEvents: "none",
      }}
    >
      nieuw
    </span>
  );
}

// A not-yet-saved Zelf toegevoegd row: name, Winkels and Schap are all
// editable, marked "nieuw" — nothing lands in the database until the green
// checkmark is pressed (onConfirm), which is when Winkels/Schap actually
// get written; the cross next to it just drops the row, since there's
// nothing to undo in the database yet.
function PendingExtraItemRow({ item, onNameChange, onAisleChange, onAvailabilityCycle, onConfirm, onCancel, confirmSize, last }) {
  return (
    <div style={{
      padding: "9px 10px",
      borderBottom: last ? "none" : "1px solid rgba(35,40,35,0.08)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            value={item.name}
            onChange={(e) => onNameChange(item.id, e.target.value)}
            aria-label="Naam van nieuw item"
            style={{ ...inputStyle, marginTop: 0, padding: "6px 8px", fontSize: 13.5, width: "100%" }}
          />
          <NewBadge />
        </div>
        <button
          onClick={() => onCancel(item.id)}
          aria-label={`${item.name || "nieuw item"} annuleren`}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", opacity: 0.6, padding: 4, flexShrink: 0 }}
        >
          <X size={15} />
        </button>
        <button
          onClick={() => onConfirm(item.id)}
          disabled={!item.name.trim()}
          aria-label={`${item.name || "nieuw item"} toevoegen`}
          style={{
            width: confirmSize, height: confirmSize, flexShrink: 0, borderRadius: 10, border: "1px solid #5C7A5E",
            background: "#5C7A5E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: item.name.trim() ? "pointer" : "not-allowed", opacity: item.name.trim() ? 1 : 0.5,
          }}
        >
          <Check size={18} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {STORE_ORDER.map((storeId) => (
            <EditableStoreBadge
              key={storeId}
              storeId={storeId}
              status={item.availability?.[storeId]}
              onClick={() => onAvailabilityCycle(item.id, storeId, nextPendingStatus(item.availability?.[storeId]))}
            />
          ))}
        </div>
        <select
          value={item.aisleCategory ?? ""}
          onChange={(e) => onAisleChange(item.id, e.target.value || null)}
          aria-label="Schap"
          title="Schap (optioneel)"
          style={{
            height: 22, borderRadius: 5, textAlign: "center", fontSize: 10.5,
            border: "1.5px solid #D8D3C2", background: "#fff", color: "#5C5F52",
          }}
        >
          <option value="">— schap</option>
          {AISLE_ORDER.map((cat) => (
            <option key={cat} value={cat}>{AISLE_LABELS[cat]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// One row in Lijst's "Zelf toegevoegd" section: name, then — in this order —
// its Winkels availability and Schap category (read-only, same properties
// Ingrediënten beheer edits), then a delete cross styled like the day-grid's
// own "remove this meal" button in Gerechten.
function ExtraItemRow({ name, availability, aisleCategory, onDelete, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
      borderBottom: last ? "none" : "1px solid rgba(35,40,35,0.08)",
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {STORE_ORDER.map((storeId) => (
          <StoreBadge key={storeId} storeId={storeId} status={availability?.[storeId]} />
        ))}
      </div>
      <span style={{
        flexShrink: 0, maxWidth: 72, fontSize: 10.5, color: "#6E6A59", textAlign: "right",
        fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {aisleCategory ? AISLE_LABELS[aisleCategory] : "—"}
      </span>
      <button
        onClick={onDelete}
        aria-label={`${name} verwijderen`}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", opacity: 0.6, padding: 4, flexShrink: 0 }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

// items: [{ name, availability, aisleCategory }], confirmed and already
// saved. pendingItems: [{ id, name, aisleCategory, availability }], not yet
// saved — rendered first, editable, marked "nieuw" (see PendingExtraItemRow).
// Renders nothing when both are empty, so the section only appears once
// something's actually been added.
export function ExtraItemsSection({
  items, onDelete,
  pendingItems = [], onPendingNameChange, onPendingAisleChange, onPendingAvailabilityCycle, onPendingConfirm, onPendingCancel, confirmBtnSize,
}) {
  if (items.length === 0 && pendingItems.length === 0) return null;
  const totalCount = pendingItems.length + items.length;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5C5F52", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
        Zelf toegevoegd
      </div>
      <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, overflow: "hidden" }}>
        {pendingItems.map((item, i) => (
          <PendingExtraItemRow
            key={item.id}
            item={item}
            onNameChange={onPendingNameChange}
            onAisleChange={onPendingAisleChange}
            onAvailabilityCycle={onPendingAvailabilityCycle}
            onConfirm={onPendingConfirm}
            onCancel={onPendingCancel}
            confirmSize={confirmBtnSize}
            last={i === totalCount - 1}
          />
        ))}
        {items.map((item, i) => (
          <ExtraItemRow key={item.name} {...item} onDelete={() => onDelete(item.name)} last={pendingItems.length + i === totalCount - 1} />
        ))}
      </div>
    </div>
  );
}
