import { useEffect, useRef, useState } from "react";
import { Send, Loader2, X } from "lucide-react";
import { askAi } from "./api.js";
import { navBtnStyle, inputStyle } from "./styles.js";

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([]); // {role: "user"|"assistant", text}
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setError("");
    const next = [...messages, { role: "user", text }];
    setMessages(next);
    setSending(true);
    try {
      const reply = await askAi(next);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setError(e.message || "Er ging iets mis, probeer het later opnieuw.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 10, display: "flex", flexDirection: "column", height: "70vh", maxHeight: 640 }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid #E1DCC9",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16 }}>Kook-assistent</div>
        <button onClick={onClose} style={{ ...navBtnStyle, width: 32, height: 32 }} aria-label="Sluiten">
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: "#6E6A59", fontSize: 13.5 }}>
            Vraag iets over recepten, vervangingen of koken.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#232823" : "#F7F5EE",
              color: m.role === "user" ? "#EEEBE2" : "#232823",
              borderRadius: 10, padding: "8px 12px", maxWidth: "80%", fontSize: 14, whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}
        {sending && <Loader2 className="animate-spin" size={16} color="#6E6A59" style={{ alignSelf: "flex-start" }} />}
        {error && <div style={{ color: "#A75135", fontSize: 13 }}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 14, borderTop: "1px solid #E1DCC9", display: "flex", gap: 8, flexShrink: 0 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Typ een vraag…"
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          style={{ ...navBtnStyle, width: 44, opacity: sending || !draft.trim() ? 0.4 : 1 }}
          aria-label="Verstuur"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
