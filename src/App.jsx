import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Check, Plus, X, ShoppingCart, CalendarDays, Loader2, Trash2, ChefHat, BookOpen } from "lucide-react";

// Zelfstandige vervanging voor Claude's window.storage (die alleen binnen
// Claude's artifact-viewer bestaat). Gebruikt gewoon localStorage van de
// browser, zodat dit ook standalone in Vite/Termux blijft opslaan.
const STORAGE_PREFIX = "weekboek:";
const storage = {
  async get(key) {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw, shared: false };
  },
  async set(key, value) {
    window.localStorage.setItem(STORAGE_PREFIX + key, value);
    return { key, value, shared: false };
  },
};

/* ---------- Design tokens ----------
   Palette: ledger / voorraadkast (pantry-notebook) thema
   - paper:    #EEEBE2
   - ink:      #232823
   - sage:     #5C7A5E  (accent - groente)
   - mustard:  #C99A3A  (accent - voorraad/granen)
   - rust:     #B5583A  (vlees)
   - blue:     #4C7A9E  (vis)
   - line:     #C9C2AE
   Type: display = Fraunces, body = Inter, mono = JetBrains Mono voor hoeveelheden

   Kookritme: maandag/woensdag/vrijdag plannen 2 dagen (kookdag + restjesdag),
   zondag plant 1 dag. Dinsdag/donderdag/zaterdag zijn restjesdagen die het
   recept van de voorgaande kookdag overnemen.
------------------------------------- */

const DEFAULT_RECIPES = [
  { id: "r1", name: "Linzen-tomatenstoof", tag: "veg",
    ingredients: [["rode linzen", "450g"], ["tomatenblokjes", "1,5 blik"], ["ui", "2"], ["knoflook", "3 tenen"], ["wortel", "3"], ["groentebouillon", "750ml"]],
    instructions: "Fruit ui en knoflook glazig. Voeg wortel toe en bak 3 min mee. Voeg linzen, tomatenblokjes en bouillon toe. Breng aan de kook en laat 20-25 min zachtjes koken tot de linzen gaar zijn. Breng op smaak met peper en zout." },
  { id: "r2", name: "Kipdij-ovenschotel", tag: "vlees",
    ingredients: [["kipdijfilet", "750g"], ["aardappelen", "900g"], ["rode ui", "2"], ["paprika", "3"], ["olijfolie", "3 el"]],
    instructions: "Verwarm de oven voor op 200°C. Snijd aardappelen, ui en paprika in stukken en meng met olijfolie, peper en zout op een bakplaat. Leg de kipdijen erbij. Bak 35-40 min tot de kip gaar en goudbruin is, halverwege omscheppen." },
  { id: "r3", name: "Spaghetti aglio e olio", tag: "veg",
    ingredients: [["spaghetti", "600g"], ["knoflook", "6 tenen"], ["chilivlokken", "1,5 tl"], ["peterselie", "1 bos"], ["parmezaan", "75g"]],
    instructions: "Kook de spaghetti beetgaar. Verhit ruim olijfolie en bak dungesneden knoflook zachtjes goudbruin met de chilivlokken. Schep de afgegoten pasta erdoor met wat kookvocht, gehakte peterselie en parmezaan." },
  { id: "r4", name: "Bonen-groentechili", tag: "veg",
    ingredients: [["kidneybonen", "3 blikken"], ["tomatenblokjes", "1,5 blik"], ["paprika", "2"], ["ui", "2"], ["komijn", "1,5 tl"]],
    instructions: "Fruit ui en paprika aan. Voeg komijn kort mee bakken. Voeg tomatenblokjes en afgespoelde bonen toe. Laat 20 min zachtjes sudderen tot een dikke chili, op smaak brengen met peper en zout." },
  { id: "r5", name: "Gebakken zalm met rijst", tag: "vis",
    ingredients: [["zalmfilet", "600g"], ["rijst", "450g"], ["broccoli", "1,5 struik"], ["citroen", "2"], ["sojasaus", "3 el"]],
    instructions: "Kook de rijst volgens de verpakking. Stoom de broccoli 5-6 min. Bak de zalm op de huid 4 min, keer en bak nog 2-3 min. Besprenkel met citroensap en sojasaus, serveer met de rijst en broccoli." },
  { id: "r6", name: "Groente-nasi", tag: "veg",
    ingredients: [["rijst", "450g"], ["diepvrieserwten", "225g"], ["eieren", "5"], ["lente-ui", "1,5 bos"], ["sojasaus", "3 el"]],
    instructions: "Gebruik het liefst een dag oude rijst. Klop de eieren los en bak er een dunne omelet van, snijd in reepjes. Bak rijst met erwten krokant in een hete wok, voeg sojasaus, lente-ui en de ei-reepjes toe." },
  { id: "r7", name: "Gehaktballen met stamppot", tag: "vlees",
    ingredients: [["gehakt", "750g"], ["aardappelen", "1050g"], ["ui", "2"], ["paneermeel", "75g"], ["melk", "300ml"]],
    instructions: "Meng gehakt met fijngesneden ui, paneermeel en een scheutje melk, kruid en rol ballen. Bak rondom bruin en gaar. Kook aardappelen gaar, stamp met melk tot een gladde puree. Serveer samen met het braadvocht." },
  { id: "r8", name: "Kikkererwtencurry", tag: "veg",
    ingredients: [["kikkererwten", "3 blikken"], ["kokosmelk", "1,5 blik"], ["kerriepoeder", "1,5 el"], ["spinazie", "225g"], ["ui", "2"]],
    instructions: "Fruit ui glazig, voeg kerriepoeder kort mee bakken. Voeg afgespoelde kikkererwten en kokosmelk toe, laat 15 min sudderen. Roer de spinazie erdoor tot geslonken en breng op smaak." },
  { id: "r9", name: "Visstick met erwten", tag: "vis",
    ingredients: [["witvisfilet", "600g"], ["paneermeel", "120g"], ["diepvrieserwten", "300g"], ["aardappelen", "750g"]],
    instructions: "Haal visfilet door bloem, ei en paneermeel. Bak of oven op 200°C in 15-18 min goudbruin en gaar. Kook aardappelen en erwten gaar en serveer erbij." },
  { id: "r10", name: "Rundvlees-gerstesoep", tag: "vlees",
    ingredients: [["rundvleesblokjes", "600g"], ["parelgort", "225g"], ["wortel", "4"], ["bleekselderij", "3 stengels"], ["runderbouillon", "1,5L"]],
    instructions: "Braad de rundvleesblokjes rondom bruin. Voeg bouillon, wortel en bleekselderij toe en breng aan de kook. Voeg parelgort toe en laat 45-60 min zachtjes koken tot vlees en gort gaar zijn." },
  { id: "r11", name: "Groente-omelet met salade", tag: "veg",
    ingredients: [["eieren", "9"], ["paprika", "1,5"], ["champignons", "225g"], ["gemengde sla", "1,5 zak"], ["kaas", "120g"]],
    instructions: "Bak paprika en champignons zacht in een pan. Klop eieren los met peper en zout, giet erbij. Strooi kaas erover en laat op laag vuur garen tot de omelet gestold is. Serveer met de sla." },
  { id: "r12", name: "Tonijn-pastaschotel", tag: "vis",
    ingredients: [["pasta", "525g"], ["tonijn uit blik", "3 blikken"], ["roomkaas", "300g"], ["diepvrieserwten", "150g"], ["belegen kaas", "150g"]],
    instructions: "Kook de pasta beetgaar. Meng roomkaas door de warme, afgegoten pasta met wat kookvocht tot een romige saus. Schep tonijn en erwten erdoor. Verdeel in een ovenschaal, bestrooi met kaas en gratineer 10 min onder de grill." },
  { id: "r13", name: "Pasta alla Norma (Ottolenghi)", tag: "veg",
    ingredients: [["aubergine", "2 stuks"], ["pasta (bijv. rigatoni)", "600g"], ["tomatenblokjes", "1,5 blik"], ["knoflook", "3 tenen"], ["ricotta salata (of pecorino)", "100g"], ["verse basilicum", "1 bos"]],
    instructions: "Snijd de aubergine in blokjes, bestrooi met zout en laat 20 min uitlekken, dep droog. Bak in ruime olijfolie goudbruin en zacht. Fruit knoflook kort mee, voeg tomatenblokjes toe en laat 15 min sudderen tot een dikke saus. Kook de pasta beetgaar, schep door de saus met de aubergine. Serveer met geraspte ricotta salata en verse basilicum." },
  { id: "r14", name: "Patricia's curry", tag: "veg",
    ingredients: [["kip of kikkererwten (naar smaak)", "600g"], ["kerriepasta", "3 el"], ["kokosmelk", "1,5 blik"], ["ui", "2"], ["knoflook", "3 tenen"], ["gember", "1 stuk"], ["groenten naar keuze", "500g"]],
    instructions: "Voorlopig placeholder-recept — pas ingrediënten, hoeveelheden en bereiding aan naar Patricia's eigen versie. Basisidee: fruit ui, knoflook en gember aan, roer de kerriepasta erdoor, voeg kokosmelk toe en laat sudderen. Voeg kip of kikkererwten en groenten toe en gaar tot alles zacht is." },
];

const TAGS = [
  { id: "veg", label: "Vegetarisch", color: "#5C7A5E" },
  { id: "vlees", label: "Vlees", color: "#B5583A" },
  { id: "vis", label: "Vis", color: "#4C7A9E" },
];

const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const DAY_NAMES_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
// Kookdagen (index in weekDates, waarbij 0=zo): 0=zo (1 dag), 1=ma (2 dagen), 3=wo (2 dagen), 5=vr (2 dagen)
const COOK_DAYS = { 0: 1, 1: 2, 3: 2, 5: 2 };
const isCookDay = (i) => Object.prototype.hasOwnProperty.call(COOK_DAYS, i);
const anchorIdxFor = (i) => (isCookDay(i) ? i : i - 1);

const dstr = (d) => d.toISOString().slice(0, 10);
const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const startOfWeek = (d) => { const x = new Date(d); const diff = x.getDay(); x.setDate(x.getDate() - diff); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => "c" + Math.random().toString(36).slice(2, 10);

export default function MealPlanner() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [history, setHistory] = useState({});
  const [recipes, setRecipes] = useState(DEFAULT_RECIPES);
  const [checked, setChecked] = useState({});
  const [saveErr, setSaveErr] = useState(false);
  const [addingDay, setAddingDay] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [editing, setEditing] = useState(null);

  const weekKey = "week:" + dstr(weekStart);

  useEffect(() => {
    (async () => {
      try {
        const h = await storage.get("history", false).catch(() => null);
        setHistory(h ? JSON.parse(h.value) : {});
      } catch { setHistory({}); }
      try {
        const r = await storage.get("recipes", false).catch(() => null);
        setRecipes(r ? JSON.parse(r.value) : DEFAULT_RECIPES);
      } catch { setRecipes(DEFAULT_RECIPES); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const c = await storage.get(weekKey + ":checked", false).catch(() => null);
        setChecked(c ? JSON.parse(c.value) : {});
      } catch { setChecked({}); }
    })();
  }, [weekKey]);

  const persistHistory = useCallback(async (next) => {
    setHistory(next);
    try {
      const res = await storage.set("history", JSON.stringify(next), false);
      if (!res) setSaveErr(true);
    } catch { setSaveErr(true); }
  }, []);

  const persistRecipes = useCallback(async (next) => {
    setRecipes(next);
    try {
      const res = await storage.set("recipes", JSON.stringify(next), false);
      if (!res) setSaveErr(true);
    } catch { setSaveErr(true); }
  }, []);

  const persistChecked = useCallback(async (next, key) => {
    setChecked(next);
    try { await storage.set(key + ":checked", JSON.stringify(next), false); } catch { setSaveErr(true); }
  }, []);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const cookDayKeys = useMemo(() => Object.keys(COOK_DAYS).map(Number), []);

  const recentlyUsed = useMemo(() => {
    const cutoff = addDays(weekStart, -21);
    const used = new Set();
    Object.entries(history).forEach(([k, v]) => {
      const d = new Date(k);
      if (d >= cutoff && d < weekStart) used.add(v);
    });
    return used;
  }, [history, weekStart]);

  const generateWeek = async () => {
    if (recipes.length === 0) return;
    const avoid = new Set(recentlyUsed);
    const next = { ...history };
    const chosenThisWeek = new Set();

    cookDayKeys.forEach((i) => {
      const key = dstr(weekDates[i]);
      if (next[key] && recipes.some((r) => r.id === next[key])) { chosenThisWeek.add(next[key]); return; }
      let candidates = recipes.filter((r) => !avoid.has(r.id) && !chosenThisWeek.has(r.id));
      if (candidates.length === 0) candidates = recipes.filter((r) => !chosenThisWeek.has(r.id));
      if (candidates.length === 0) candidates = recipes;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      next[key] = pick.id;
      chosenThisWeek.add(pick.id);
    });
    await persistHistory(next);
  };

  const setCookDay = async (key, recipeId) => {
    const next = { ...history, [key]: recipeId || undefined };
    if (!recipeId) delete next[key];
    await persistHistory(next);
    setAddingDay(null);
  };

  // Alleen kookdagen leveren boodschappen op (restjesdagen delen dezelfde portie)
  const groceryList = useMemo(() => {
    const map = {};
    cookDayKeys.forEach((i) => {
      const rid = history[dstr(weekDates[i])];
      const recipe = recipes.find((r) => r.id === rid);
      if (!recipe) return;
      recipe.ingredients.forEach(([name, qty]) => {
        if (!map[name]) map[name] = [];
        map[name].push(qty);
      });
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [history, weekDates, recipes, cookDayKeys]);

  const toggleCheck = (name) => {
    const next = { ...checked, [name]: !checked[name] };
    persistChecked(next, weekKey);
  };

  const addRecipe = async (draft) => {
    const clean = {
      id: uid(),
      name: draft.name.trim(),
      tag: draft.tag,
      instructions: draft.instructions.trim(),
      ingredients: draft.ingredients.map(([n, q]) => [n.trim(), q.trim()]).filter(([n]) => n.length > 0),
    };
    if (!clean.name || clean.ingredients.length === 0) return;
    await persistRecipes([...recipes, clean]);
    setEditing(null);
  };

  const removeRecipe = async (id) => {
    await persistRecipes(recipes.filter((r) => r.id !== id));
    const next = { ...history };
    let changed = false;
    Object.entries(next).forEach(([k, v]) => { if (v === id) { delete next[k]; changed = true; } });
    if (changed) await persistHistory(next);
  };

  const plannedCount = cookDayKeys.filter((i) => history[dstr(weekDates[i])]).length;
  const isThisWeek = dstr(weekStart) === dstr(startOfWeek(new Date()));

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#EEEBE2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" color="#5C7A5E" size={28} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#EEEBE2", fontFamily: "'Inter', system-ui, sans-serif", color: "#232823", paddingBottom: 48 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        .ledger-btn { transition: all .15s ease; }
        .ledger-btn:hover { transform: translateY(-1px); }
        .ledger-btn:focus-visible, .day-card:focus-visible, .check-row:focus-visible, .link-btn:focus-visible { outline: 2px solid #5C7A5E; outline-offset: 2px; }
        input, select, textarea { font-family: 'Inter', sans-serif; }
        @media (prefers-reduced-motion: reduce) { .ledger-btn { transition: none; } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #C9C2AE", padding: "28px 20px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <CalendarDays size={22} color="#5C7A5E" />
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}>
                Het Weekboek
              </h1>
            </div>
            <p style={{ margin: "6px 0 0 32px", fontSize: 14, color: "#5C5F52" }}>
              Ma/wo/vr koken voor 2 dagen, zo voor 1 dag. Porties voor 6.
            </p>
          </div>
          <button className="ledger-btn link-btn" onClick={() => setShowManage((s) => !s)}
            style={{ ...navBtnStyle, width: "auto", padding: "0 12px", gap: 6, display: "flex" }}>
            <ChefHat size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Recepten</span>
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px" }}>

        {showManage ? (
          <RecipeManager
            recipes={recipes}
            editing={editing}
            setEditing={setEditing}
            onAdd={addRecipe}
            onRemove={removeRecipe}
            onClose={() => { setShowManage(false); setEditing(null); }}
          />
        ) : (
          <>
            {/* Weeknavigatie */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <button className="ledger-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtnStyle} aria-label="Vorige week">
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>
                  {isThisWeek ? "Deze week" : fmtDate(weekStart)}
                </div>
                <div style={{ fontSize: 12, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtDate(weekDates[0])} – {fmtDate(weekDates[6])}
                </div>
              </div>
              <button className="ledger-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtnStyle} aria-label="Volgende week">
                <ChevronRight size={18} />
              </button>
            </div>

            <button className="ledger-btn" onClick={generateWeek} style={generateBtnStyle} disabled={recipes.length === 0}>
              <RefreshCw size={16} />
              {plannedCount === cookDayKeys.length ? "Kookdagen opnieuw invullen" : "Stel kookplan voor deze week voor"}
            </button>
            {recipes.length === 0 && (
              <p style={{ fontSize: 12, color: "#8A8570", marginTop: 8 }}>Voeg eerst een recept toe via "Recepten" rechtsboven.</p>
            )}
            {saveErr && (
              <p style={{ fontSize: 12, color: "#B5583A", marginTop: 8 }}>
                Opslaan lukte net niet — je planning wordt mogelijk niet bewaard. Probeer het zo nog eens.
              </p>
            )}

            {/* Dagenraster */}
            <div style={{ marginTop: 22, borderTop: "1px solid #C9C2AE" }}>
              {weekDates.map((d, i) => {
                const anchorI = anchorIdxFor(i);
                const anchorKey = dstr(weekDates[anchorI]);
                const recipe = recipes.find((r) => r.id === history[anchorKey]);
                const isToday = dstr(d) === dstr(new Date());
                const cook = isCookDay(i);
                const dayKey = dstr(d);
                const expanded = expandedDay === dayKey;
                return (
                  <div key={dayKey} style={{ borderBottom: "1px solid #C9C2AE", background: isToday ? "rgba(92,122,94,0.07)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 4px" }}>
                      <div style={{ width: 44, flexShrink: 0 }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8A8570" }}>{DAY_NAMES[i]}</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16 }}>{d.getDate()}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {cook && addingDay === dayKey ? (
                          <select
                            autoFocus
                            defaultValue=""
                            onChange={(e) => setCookDay(dayKey, e.target.value)}
                            onBlur={() => setAddingDay(null)}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff", fontSize: 14 }}
                          >
                            <option value="" disabled>Kies een maaltijd…</option>
                            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : recipe ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: tagColor(recipe.tag), flexShrink: 0 }} />
                            <button
                              onClick={() => (cook ? setAddingDay(dayKey) : setExpandedDay(expanded ? null : dayKey))}
                              className="day-card"
                              style={{ background: "none", border: "none", padding: 0, fontSize: 14.5, fontWeight: 500, cursor: "pointer", textAlign: "left", color: "#232823" }}
                            >
                              {recipe.name}
                            </button>
                            {!cook && (
                              <span style={{ fontSize: 11.5, color: "#8A8570", fontStyle: "italic" }}>
                                · restje van {DAY_NAMES_FULL[anchorI]}
                              </span>
                            )}
                            {recipe.instructions && (
                              <button
                                onClick={() => setExpandedDay(expanded ? null : dayKey)}
                                aria-label="Bereidingswijze tonen"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8570", padding: 2, display: "flex" }}
                              >
                                <BookOpen size={14} />
                              </button>
                            )}
                          </div>
                        ) : cook ? (
                          <button onClick={() => setAddingDay(dayKey)} className="day-card" style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: "#8A8570", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            <Plus size={14} /> Maaltijd toevoegen
                          </button>
                        ) : (
                          <span style={{ fontSize: 13.5, color: "#B5B096", fontStyle: "italic" }}>nog geen kookdag gepland</span>
                        )}
                      </div>
                      {cook && recipe && (
                        <button onClick={() => setCookDay(anchorKey, null)} aria-label="Maaltijd verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", opacity: 0.6, padding: 4 }}>
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {expanded && recipe && recipe.instructions && (
                      <div style={{ padding: "0 4px 16px 58px", fontSize: 13.5, color: "#4A4E42", lineHeight: 1.55 }}>
                        {recipe.instructions}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Boodschappenlijst */}
            <div style={{ marginTop: 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ShoppingCart size={18} color="#C99A3A" />
                <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 19, margin: 0 }}>Boodschappenlijst</h2>
              </div>
              <p style={{ fontSize: 13, color: "#8A8570", margin: "0 0 14px" }}>
                {groceryList.length === 0 ? "Plan hierboven kookdagen om deze lijst te vullen." : `Samengesteld uit ${plannedCount} kookdag${plannedCount === 1 ? "" : "en"}.`}
              </p>
              {groceryList.length > 0 && (
                <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, overflow: "hidden" }}>
                  {groceryList.map(([name, qtys], i) => (
                    <div
                      key={name}
                      className="check-row"
                      onClick={() => toggleCheck(name)}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={!!checked[name]}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCheck(name); } }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                        borderBottom: i < groceryList.length - 1 ? "1px solid #E1DCC9" : "none",
                        cursor: "pointer", opacity: checked[name] ? 0.45 : 1,
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, border: "1.5px solid #5C7A5E", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: checked[name] ? "#5C7A5E" : "transparent",
                      }}>
                        {checked[name] && <Check size={13} color="#fff" />}
                      </span>
                      <span style={{ flex: 1, fontSize: 14.5, textDecoration: checked[name] ? "line-through" : "none" }}>{name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#8A8570" }}>
                        {qtys.join(" + ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RecipeManager({ recipes, editing, setEditing, onAdd, onRemove, onClose }) {
  const startNew = () => setEditing({ name: "", tag: "veg", ingredients: [["", ""]], instructions: "" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21, margin: 0 }}>Recepten beheren</h2>
        <button className="ledger-btn link-btn" onClick={onClose} style={{ background: "none", border: "none", fontSize: 13, color: "#5C7A5E", cursor: "pointer", fontWeight: 600 }}>
          Terug naar planning
        </button>
      </div>

      {!editing && (
        <button className="ledger-btn" onClick={startNew} style={{ ...generateBtnStyle, background: "#5C7A5E", marginBottom: 20 }}>
          <Plus size={16} /> Nieuw recept toevoegen
        </button>
      )}

      {editing && (
        <RecipeForm draft={editing} setDraft={setEditing} onSave={onAdd} onCancel={() => setEditing(null)} />
      )}

      <div style={{ borderTop: "1px solid #C9C2AE" }}>
        {recipes.length === 0 && (
          <p style={{ fontSize: 13, color: "#8A8570", padding: "16px 4px" }}>Nog geen recepten. Voeg er hierboven een toe.</p>
        )}
        {recipes.map((r) => (
          <div key={r.id} style={{ padding: "13px 4px", borderBottom: "1px solid #C9C2AE" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: tagColor(r.tag), flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{r.name}</span>
              <button onClick={() => onRemove(r.id)} aria-label={`${r.name} verwijderen`} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </div>
            <div style={{ marginLeft: 17, marginTop: 4, fontSize: 12.5, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace" }}>
              {r.ingredients.map(([n, q]) => `${n} ${q}`).join(" · ")}
            </div>
            {r.instructions && (
              <div style={{ marginLeft: 17, marginTop: 6, fontSize: 12.5, color: "#4A4E42", lineHeight: 1.5 }}>
                {r.instructions}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeForm({ draft, setDraft, onSave, onCancel }) {
  const updateIngredient = (i, field, val) => {
    const next = draft.ingredients.map((ing, idx) => (idx === i ? [field === "name" ? val : ing[0], field === "qty" ? val : ing[1]] : ing));
    setDraft({ ...draft, ingredients: next });
  };
  const addRow = () => setDraft({ ...draft, ingredients: [...draft.ingredients, ["", ""]] });
  const removeRow = (i) => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, idx) => idx !== i) });

  return (
    <div style={{ background: "#F7F5EE", border: "1px solid #C9C2AE", borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <label style={labelStyle}>Naam van het gerecht</label>
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="bijv. Groentesoep"
        style={inputStyle}
      />

      <label style={{ ...labelStyle, marginTop: 12 }}>Categorie</label>
      <div style={{ display: "flex", gap: 8 }}>
        {TAGS.map((t) => (
          <button
            key={t.id}
            onClick={() => setDraft({ ...draft, tag: t.id })}
            style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: draft.tag === t.id ? `1.5px solid ${t.color}` : "1.5px solid #C9C2AE",
              background: draft.tag === t.id ? `${t.color}22` : "#fff",
              color: draft.tag === t.id ? t.color : "#5C5F52", fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label style={{ ...labelStyle, marginTop: 14 }}>Ingrediënten <span style={{ fontWeight: 400, color: "#8A8570" }}>(voor 6 personen)</span></label>
      {draft.ingredients.map((ing, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            value={ing[0]}
            onChange={(e) => updateIngredient(i, "name", e.target.value)}
            placeholder="ingrediënt"
            style={{ ...inputStyle, flex: 2, marginTop: 0 }}
          />
          <input
            value={ing[1]}
            onChange={(e) => updateIngredient(i, "qty", e.target.value)}
            placeholder="hoeveelheid"
            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
          />
          <button onClick={() => removeRow(i)} aria-label="Regel verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", padding: "0 4px" }}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button onClick={addRow} className="link-btn" style={{ background: "none", border: "none", color: "#5C7A5E", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginTop: 4, padding: "4px 0" }}>
        <Plus size={14} /> Ingrediënt toevoegen
      </button>

      <label style={{ ...labelStyle, marginTop: 14 }}>Bereidingswijze</label>
      <textarea
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        placeholder="Beschrijf de bereiding stap voor stap…"
        rows={4}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={() => onSave(draft)} style={{ ...generateBtnStyle, background: "#5C7A5E", flex: 1 }}>
          Recept opslaan
        </button>
        <button onClick={onCancel} style={{ ...navBtnStyle, width: "auto", padding: "0 18px" }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

function tagColor(tag) {
  if (tag === "vlees") return "#B5583A";
  if (tag === "vis") return "#4C7A9E";
  return "#5C7A5E";
}

const navBtnStyle = {
  height: 34, borderRadius: 8, border: "1px solid #C9C2AE", background: "#F7F5EE",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#232823", width: 34,
};

const generateBtnStyle = {
  width: "100%", padding: "13px 16px", borderRadius: 10, border: "none",
  background: "#232823", color: "#EEEBE2", fontSize: 14.5, fontWeight: 600,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
};

const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 600, color: "#5C5F52", marginBottom: 5 };

const inputStyle = {
  width: "100%", padding: "9px 10px", borderRadius: 7, border: "1px solid #C9C2AE",
  background: "#fff", fontSize: 14, marginTop: 2, boxSizing: "border-box",
};
