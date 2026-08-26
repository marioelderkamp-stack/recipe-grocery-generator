import { useState } from "react";
import { ThumbsUp, ThumbsDown, PauseCircle, Trash2 } from "lucide-react";
import { generateBtnStyle, navBtnStyle } from "./styles.js";

export default function WeekReview({ recipes, onClose, onDeleteRecipe, onSuspendRecipe }) {
  const [step, setStep] = useState("rate"); // "rate" | "thanks" | "pick" | "act"
  const [dislikedIds, setDislikedIds] = useState(new Set());
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const toggleDisliked = (id) => {
    setDislikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const dislikedRecipes = recipes.filter((r) => dislikedIds.has(r.id));

  return (
    <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 20 }}>
      {step === "rate" && (
        <>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: "0 0 6px" }}>
            Hoe was deze week?
          </h3>
          <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 18px" }}>
            {recipes.map((r) => r.name).join(", ")}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setStep("thanks")}
              style={{ ...generateBtnStyle, background: "#5C7A5E", flex: 1 }}
            >
              <ThumbsUp size={16} /> Prima zo
            </button>
            <button
              onClick={() => setStep("pick")}
              style={{ ...generateBtnStyle, background: "#A75135", flex: 1 }}
            >
              <ThumbsDown size={16} /> Niet alles was raak
            </button>
          </div>
        </>
      )}

      {step === "thanks" && (
        <>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: "0 0 10px" }}>
            Fijn om te horen!
          </h3>
          <p style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.5, margin: "0 0 18px" }}>
            Deze week is beoordeeld — er is verder niets dat je hoeft te doen.
          </p>
          <button onClick={onClose} style={{ ...navBtnStyle, width: "100%" }}>Sluiten</button>
        </>
      )}

      {step === "pick" && (
        <>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: "0 0 6px" }}>
            Welke gerechten vielen tegen?
          </h3>
          <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 14px" }}>
            Vink aan wat je niet beviel.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 18 }}>
            {recipes.map((r) => (
              <div
                key={r.id}
                className="check-row"
                onClick={() => toggleDisliked(r.id)}
                role="checkbox"
                tabIndex={0}
                aria-checked={dislikedIds.has(r.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDisliked(r.id); } }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 8, cursor: "pointer" }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 4, border: "1.5px solid #A75135", flexShrink: 0,
                  background: dislikedIds.has(r.id) ? "#A75135" : "transparent",
                }} />
                <span style={{ fontSize: 14.5 }}>{r.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setStep("act")}
              disabled={dislikedIds.size === 0}
              style={{ ...generateBtnStyle, background: "#232823", flex: 1, opacity: dislikedIds.size === 0 ? 0.4 : 1, cursor: dislikedIds.size === 0 ? "not-allowed" : "pointer" }}
            >
              Volgende
            </button>
            <button onClick={onClose} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>Sluiten</button>
          </div>
        </>
      )}

      {step === "act" && (
        <>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: "0 0 6px" }}>
            Wat wil je ermee doen?
          </h3>
          <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 14px" }}>
            Pauzeren houdt het recept, maar slaat het over in het kookplan totdat je het aanpast.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {dislikedRecipes.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #C9C2AE", background: "#fff" }}>
                <span style={{ fontSize: 14, flex: 1 }}>{r.name}</span>
                {r.suspended ? (
                  <span style={{ fontSize: 12, color: "#6E6A59", fontWeight: 600 }}>Gepauzeerd</span>
                ) : confirmingDeleteId === r.id ? (
                  <button
                    onClick={() => { onDeleteRecipe(r.id); setConfirmingDeleteId(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", fontSize: 12.5, fontWeight: 700 }}
                  >
                    Zeker weten?
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => onSuspendRecipe(r.id)}
                      aria-label={`${r.name} pauzeren`}
                      title="Pauzeren"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 4, display: "flex" }}
                    >
                      <PauseCircle size={17} />
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(r.id)}
                      aria-label={`${r.name} verwijderen`}
                      title="Verwijderen"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", padding: 4, display: "flex" }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ ...navBtnStyle, width: "100%" }}>Klaar</button>
        </>
      )}
    </div>
  );
}
