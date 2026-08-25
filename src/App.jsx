import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, X, CalendarDays, Loader2, ChefHat, BookOpen, Carrot, MessageSquareText, Lock, Unlock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dstr, fmtDate, startOfWeek, addDays, COOK_DAYS, OPTIONAL_DAYS, isCookDay, anchorIdxFor, tagColor, STORE_ORDER, assignStore } from "./lib.js";
import { DEFAULT_RECIPES, DAY_NAMES } from "./data.js";
import { fetchRecipesFromDb, resolveIngredientIds, suspendRecipe as suspendRecipeApi } from "./api.js";
import { navBtnStyle, generateBtnStyle } from "./styles.js";
import RecipeManager from "./RecipeManager.jsx";
import IngredientManager from "./IngredientManager.jsx";
import { GroceryModeSlider, GroceryStoreSummary, StoreSection } from "./GroceryList.jsx";
import Modal from "./Modal.jsx";
import WeekReview from "./WeekReview.jsx";

/* ---------- Design tokens ----------
   Palette: ledger / voorraadkast (pantry-notebook) thema
   - paper:    #EEEBE2
   - ink:      #232823
   - sage:     #5C7A5E  (accent - groente)
   - mustard:  #C99A3A  (accent - voorraad/granen)
   - rust:     #B5583A  (vlees)
   - blue:     #4C7A9E  (vis; ook Albert Heijn in de boodschappenlijst)
   - purple:   #8B5FA6  (Ekoplaza in de boodschappenlijst)
   - line:     #C9C2AE
   Mustard doet in de boodschappenlijst dubbele dienst als Lidl-kleur.
   Type: display = Fraunces, body = Inter, mono = JetBrains Mono voor hoeveelheden

   Kookritme: maandag/woensdag/vrijdag plannen 2 dagen (kookdag + restjesdag),
   zondag plant 1 dag. Dinsdag/donderdag/zaterdag zijn restjesdagen die het
   recept van de voorgaande kookdag overnemen.
------------------------------------- */

export default function MealPlanner() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [history, setHistory] = useState({});
  const [recipes, setRecipes] = useState(DEFAULT_RECIPES);
  const [checked, setChecked] = useState({});
  const [saveErr, setSaveErr] = useState(false);
  const [addingDay, setAddingDay] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [view, setView] = useState("planner"); // "planner" | "recipes" | "ingredients"
  const [editing, setEditing] = useState(null);
  const [availability, setAvailability] = useState({});
  const [groceryMode, setGroceryMode] = useState("bio"); // "bio" | "trips"
  const [ingredientNames, setIngredientNames] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planTab, setPlanTab] = useState("gerechten"); // "gerechten" | "boodschappen"
  const [locked, setLocked] = useState(false);

  const weekKey = "week:" + dstr(weekStart);
  const ingredientIdsRef = useRef(new Map());

  useEffect(() => {
    (async () => {
      try {
        const [recipesData, planRows, idRows, availabilityRows] = await Promise.all([
          fetchRecipesFromDb(),
          supabase.from("plan_days").select("day,recipe_id"),
          supabase.from("ingredients").select("id,name"),
          supabase.from("ingredient_availability").select("supermarket_id,status,ingredients(name)"),
        ]);
        if (planRows.error) throw planRows.error;
        if (idRows.error) throw idRows.error;
        setRecipes(recipesData);
        const historyMap = {};
        planRows.data.forEach((row) => { if (row.recipe_id) historyMap[row.day] = row.recipe_id; });
        setHistory(historyMap);
        ingredientIdsRef.current = new Map(idRows.data.map((i) => [i.name, i.id]));
        setIngredientNames(idRows.data.map((i) => i.name));
        if (!availabilityRows.error) {
          const availMap = {};
          availabilityRows.data.forEach((row) => {
            if (!row.ingredients) return;
            const name = row.ingredients.name;
            if (!availMap[name]) availMap[name] = {};
            availMap[name][row.supermarket_id] = row.status;
          });
          setAvailability(availMap);
        }
      } catch {
        setRecipes(DEFAULT_RECIPES);
        setHistory({});
        setIngredientNames([...new Set(DEFAULT_RECIPES.flatMap((r) => r.ingredients.map(([n]) => n)))]);
        setSaveErr(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("grocery_checked")
          .select("checked, ingredients(name)")
          .eq("week_start", dstr(weekStart));
        if (error) throw error;
        const map = {};
        data.forEach((row) => { if (row.checked && row.ingredients) map[row.ingredients.name] = true; });
        setChecked(map);
      } catch { setChecked({}); }
    })();
  }, [weekKey, weekStart]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("weeks").select("locked").eq("week_start", dstr(weekStart)).maybeSingle();
        if (error) throw error;
        setLocked(data?.locked ?? false);
      } catch { setLocked(false); }
    })();
  }, [weekKey, weekStart]);

  const toggleLock = async () => {
    const next = !locked;
    setLocked(next);
    try {
      const { error } = await supabase.from("weeks").upsert({ week_start: dstr(weekStart), locked: next }, { onConflict: "week_start" });
      if (error) throw error;
    } catch { setSaveErr(true); }
  };

  const persistHistory = useCallback(async (next) => {
    const prevMap = history;
    setHistory(next);
    try {
      const days = new Set([...Object.keys(prevMap), ...Object.keys(next)]);
      const toUpsert = [];
      const toDelete = [];
      days.forEach((day) => {
        if (prevMap[day] === next[day]) return;
        if (next[day]) toUpsert.push({ day, recipe_id: next[day] });
        else toDelete.push(day);
      });
      if (toUpsert.length) {
        const { error } = await supabase.from("plan_days").upsert(toUpsert, { onConflict: "day" });
        if (error) throw error;
      }
      if (toDelete.length) {
        const { error } = await supabase.from("plan_days").delete().in("day", toDelete);
        if (error) throw error;
      }
    } catch { setSaveErr(true); }
  }, [history]);

  const persistChecked = useCallback(async (next, key) => {
    setChecked(next);
    try {
      const weekStartDate = key.slice(5);
      const rows = [];
      Object.keys(next).forEach((name) => {
        const id = ingredientIdsRef.current.get(name);
        if (!id) return;
        rows.push({ week_start: weekStartDate, ingredient_id: id, checked: !!next[name] });
      });
      if (rows.length) {
        const { error } = await supabase.from("grocery_checked").upsert(rows, { onConflict: "week_start,ingredient_id" });
        if (error) throw error;
      }
    } catch { setSaveErr(true); }
  }, []);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const cookDayKeys = useMemo(() => Object.keys(COOK_DAYS).map(Number), []);
  const optionalDayKeys = useMemo(() => Object.keys(OPTIONAL_DAYS).map(Number), []);
  const allCookKeys = useMemo(() => [...cookDayKeys, ...optionalDayKeys], [cookDayKeys, optionalDayKeys]);

  const recentlyUsed = useMemo(() => {
    const cutoff = addDays(weekStart, -21);
    const used = new Set();
    Object.entries(history).forEach(([k, v]) => {
      const d = new Date(k);
      if (d >= cutoff && d < weekStart) used.add(v);
    });
    return used;
  }, [history, weekStart]);

  // Gepauzeerde recepten mogen nog wel handmatig per dag gekozen worden, maar
  // komen niet meer uit de automatische generator totdat ze bewerkt worden.
  const usableRecipes = useMemo(() => recipes.filter((r) => !r.suspended), [recipes]);

  const generateWeek = async () => {
    if (usableRecipes.length === 0) return;
    const avoid = new Set(recentlyUsed);
    const next = { ...history };
    const chosenThisWeek = new Set();

    cookDayKeys.forEach((i) => {
      const key = dstr(weekDates[i]);
      let candidates = usableRecipes.filter((r) => !avoid.has(r.id) && !chosenThisWeek.has(r.id));
      if (candidates.length === 0) candidates = usableRecipes.filter((r) => !chosenThisWeek.has(r.id));
      if (candidates.length === 0) candidates = usableRecipes;
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

  // Kookdagen (incl. handmatig gevulde zaterdag) leveren boodschappen op (restjesdagen delen dezelfde portie)
  const groceryList = useMemo(() => {
    const map = {};
    allCookKeys.forEach((i) => {
      const rid = history[dstr(weekDates[i])];
      const recipe = recipes.find((r) => r.id === rid);
      if (!recipe) return;
      recipe.ingredients.forEach(([name, qty]) => {
        if (!map[name]) map[name] = [];
        map[name].push(qty);
      });
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [history, weekDates, recipes, allCookKeys]);

  // Wijst elk boodschappenlijst-item toe aan één winkel, afhankelijk van de
  // slider-stand. "bio": bio heeft voorrang boven winkelvolgorde (Lidl > AH >
  // Ekoplaza bio, en pas als nergens bio is de dichtstbijzijnde niet-bio optie).
  // "trips": winkelvolgorde heeft voorrang boven bio (eerste winkel die het
  // product sowieso heeft — bio of niet-bio — wordt gebruikt).
  const groceryByStore = useMemo(() => {
    const result = { lidl: [], ah: [], ekoplaza: [], other: [] };
    groceryList.forEach(([name, qtys]) => {
      const { store, bio } = assignStore(availability[name], groceryMode);
      const item = { name, qtys, bio };
      (store ? result[store] : result.other).push(item);
    });
    return result;
  }, [groceryList, availability, groceryMode]);

  const toggleCheck = (name) => {
    const next = { ...checked, [name]: !checked[name] };
    persistChecked(next, weekKey);
  };

  // De unieke recepten die deze week daadwerkelijk gepland staan, voor de
  // weekbeoordeling. Op volgorde van eerste kookdag.
  const weekRecipes = useMemo(() => {
    const seen = new Map();
    allCookKeys.forEach((i) => {
      const rid = history[dstr(weekDates[i])];
      const recipe = recipes.find((r) => r.id === rid);
      if (recipe && !seen.has(recipe.id)) seen.set(recipe.id, recipe);
    });
    return [...seen.values()];
  }, [history, weekDates, recipes, allCookKeys]);

  const addRecipe = async (draft) => {
    const clean = {
      name: draft.name.trim(),
      tag: draft.tag,
      instructions: draft.instructions.trim(),
      prepMinutes: parseInt(draft.prepMinutes, 10) || null,
      ingredients: draft.ingredients.map(([n, q]) => [n.trim(), q.trim()]).filter(([n]) => n.length > 0),
    };
    if (!clean.name || clean.ingredients.length === 0 || !clean.prepMinutes) return;
    try {
      const { data: inserted, error } = await supabase
        .from("recipes")
        .insert({ name: clean.name, tag: clean.tag, instructions: clean.instructions, prep_minutes: clean.prepMinutes })
        .select("id")
        .single();
      if (error) throw error;
      const idMap = await resolveIngredientIds(clean.ingredients.map(([n]) => n));
      idMap.forEach((id, name) => ingredientIdsRef.current.set(name, id));
      const rows = clean.ingredients.map(([n, q], i) => ({ recipe_id: inserted.id, ingredient_id: idMap.get(n), quantity: q, sort_order: i }));
      const { error: riErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (riErr) throw riErr;
      setRecipes((prev) => [...prev, { id: inserted.id, ...clean }]);
      setEditing(null);
    } catch { setSaveErr(true); }
  };

  const updateRecipe = async (id, draft) => {
    const clean = {
      name: draft.name.trim(),
      tag: draft.tag,
      instructions: draft.instructions.trim(),
      prepMinutes: parseInt(draft.prepMinutes, 10) || null,
      ingredients: draft.ingredients.map(([n, q]) => [n.trim(), q.trim()]).filter(([n]) => n.length > 0),
    };
    if (!clean.name || clean.ingredients.length === 0 || !clean.prepMinutes) return;
    try {
      // Bewerken heft een eventuele pauze op — de aanname is dat het probleem
      // dat tot de pauze leidde nu is aangepakt.
      const { error } = await supabase.from("recipes").update({ name: clean.name, tag: clean.tag, instructions: clean.instructions, prep_minutes: clean.prepMinutes, suspended: false }).eq("id", id);
      if (error) throw error;
      const idMap = await resolveIngredientIds(clean.ingredients.map(([n]) => n));
      idMap.forEach((idVal, name) => ingredientIdsRef.current.set(name, idVal));
      const { error: delErr } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
      if (delErr) throw delErr;
      const rows = clean.ingredients.map(([n, q], i) => ({ recipe_id: id, ingredient_id: idMap.get(n), quantity: q, sort_order: i }));
      const { error: riErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (riErr) throw riErr;
      setRecipes((prev) => prev.map((r) => (r.id === id ? { id, ...clean, suspended: false } : r)));
      setEditing(null);
    } catch { setSaveErr(true); }
  };

  const suspendRecipe = async (id) => {
    try {
      await suspendRecipeApi(id);
      setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, suspended: true } : r)));
    } catch { setSaveErr(true); }
  };

  const removeRecipe = async (id) => {
    try {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      // plan_days.recipe_id is ON DELETE SET NULL, so the DB already cleared
      // references to this recipe — mirror that in local state.
      setHistory((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.entries(next).forEach(([k, v]) => { if (v === id) { delete next[k]; changed = true; } });
        return changed ? next : prev;
      });
    } catch { setSaveErr(true); }
  };

  // Ingrediëntenbeheer kan namen toevoegen/hernoemen/samenvoegen/verwijderen
  // terwijl dat tabblad open is; ververs de lokale lijst zodra je terugkeert
  // zodat autocomplete in het receptenformulier weer klopt.
  const refreshIngredientNames = async () => {
    try {
      const { data, error } = await supabase.from("ingredients").select("id,name");
      if (error) throw error;
      ingredientIdsRef.current = new Map(data.map((i) => [i.name, i.id]));
      setIngredientNames(data.map((i) => i.name));
    } catch { /* volgende sessie proberen we het weer */ }
  };

  const filledCookDayCount = allCookKeys.filter((i) => history[dstr(weekDates[i])]).length;
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
        .mode-slider { -webkit-appearance: none; appearance: none; height: 24px; background: transparent; cursor: pointer; }
        .mode-slider::-webkit-slider-runnable-track { height: 11px; border-radius: 6px; background: #DDD6C4; }
        .mode-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 25px; height: 25px; border-radius: 50%;
          background: #5C7A5E; border: 2px solid #F7F5EE; margin-top: -7px;
          box-shadow: 0 1px 3px rgba(35,40,35,0.35);
        }
        .mode-slider::-moz-range-track { height: 11px; border-radius: 6px; background: #DDD6C4; }
        .mode-slider::-moz-range-thumb {
          width: 25px; height: 25px; border-radius: 50%; background: #5C7A5E;
          border: 2px solid #F7F5EE; box-shadow: 0 1px 3px rgba(35,40,35,0.35);
        }
        .mode-slider:focus-visible::-webkit-slider-thumb { outline: 2px solid #5C7A5E; outline-offset: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #C9C2AE", padding: "28px 20px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <CalendarDays size={22} color="#5C7A5E" />
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}>
              Kookplan
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="ledger-btn link-btn" onClick={() => setView((v) => (v === "ingredients" ? "planner" : "ingredients"))}
              style={{ ...navBtnStyle, width: 148, padding: "0 12px", gap: 6, display: "flex", justifyContent: "center" }}>
              <Carrot size={16} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Ingrediënten</span>
            </button>
            <button className="ledger-btn link-btn" onClick={() => setView((v) => (v === "recipes" ? "planner" : "recipes"))}
              style={{ ...navBtnStyle, width: 148, padding: "0 12px", gap: 6, display: "flex", justifyContent: "center" }}>
              <ChefHat size={16} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Recepten</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px" }}>

        {view === "recipes" ? (
          <RecipeManager
            recipes={recipes}
            editing={editing}
            setEditing={setEditing}
            onAdd={addRecipe}
            onUpdate={updateRecipe}
            onRemove={removeRecipe}
            onClose={() => { setView("planner"); setEditing(null); }}
            ingredientNames={ingredientNames}
          />
        ) : view === "ingredients" ? (
          <IngredientManager onClose={() => { setView("planner"); refreshIngredientNames(); }} />
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

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="ledger-btn"
                onClick={generateWeek}
                disabled={usableRecipes.length === 0 || locked}
                style={{
                  ...generateBtnStyle, width: "auto", height: 44, padding: "0 16px", flex: 2,
                  opacity: usableRecipes.length === 0 || locked ? 0.4 : 1,
                  cursor: usableRecipes.length === 0 || locked ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw size={16} />
                Maak weekplan
              </button>
              <button
                className="ledger-btn"
                onClick={toggleLock}
                aria-label={locked ? "Weekplan ontgrendelen" : "Weekplan vergrendelen"}
                title={locked ? "Weekplan ontgrendelen" : "Weekplan vergrendelen"}
                style={{
                  ...navBtnStyle, width: 44, height: 44, flexShrink: 0, borderRadius: 10,
                  background: locked ? "#5C7A5E" : "#F7F5EE", color: locked ? "#fff" : "#232823",
                  border: locked ? "1px solid #5C7A5E" : "1px solid #C9C2AE",
                }}
              >
                {locked ? <Lock size={18} /> : <Unlock size={18} />}
              </button>
              <button
                className="ledger-btn"
                onClick={() => setReviewOpen(true)}
                disabled={weekRecipes.length === 0}
                style={{
                  height: 44, padding: "0 12px", borderRadius: 10, flex: 1,
                  border: "1px solid #C9C2AE", background: "#F7F5EE", color: "#232823",
                  fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6, cursor: weekRecipes.length === 0 ? "not-allowed" : "pointer",
                  opacity: weekRecipes.length === 0 ? 0.4 : 1,
                }}
              >
                <MessageSquareText size={16} /> Beoordeel weekplan
              </button>
            </div>
            {locked ? (
              <p style={{ fontSize: 12, color: "#8A8570", marginTop: 8 }}>
                Dit weekplan is vergrendeld — ontgrendel om wijzigingen aan te brengen.
              </p>
            ) : usableRecipes.length === 0 && (
              <p style={{ fontSize: 12, color: "#8A8570", marginTop: 8 }}>
                {recipes.length === 0 ? 'Voeg eerst een recept toe via "Recepten" rechtsboven.' : "Alle recepten staan gepauzeerd — pas er eentje aan om ze weer te kunnen plannen."}
              </p>
            )}
            {saveErr && (
              <p style={{ fontSize: 12, color: "#B5583A", marginTop: 8 }}>
                Opslaan lukte net niet — je planning wordt mogelijk niet bewaard. Probeer het zo nog eens.
              </p>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 6, marginTop: 22, borderBottom: "1px solid #C9C2AE" }}>
              {[["gerechten", "Gerechten"], ["boodschappen", "Boodschappen"]].map(([id, label]) => (
                <button
                  key={id}
                  className="ledger-btn"
                  onClick={() => setPlanTab(id)}
                  style={{
                    flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 0",
                    fontSize: 14.5, fontWeight: 700, color: planTab === id ? "#232823" : "#8A8570",
                    borderBottom: planTab === id ? "2px solid #5C7A5E" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dagenraster */}
            {planTab === "gerechten" && (
            <div style={{ borderTop: "1px solid #C9C2AE" }}>
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
                        {cook && addingDay === dayKey && !locked ? (
                          <select
                            autoFocus
                            defaultValue=""
                            onChange={(e) => setCookDay(dayKey, e.target.value)}
                            onBlur={() => setAddingDay(null)}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff", fontSize: 14 }}
                          >
                            <option value="" disabled>Kies een maaltijd…</option>
                            {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.suspended ? " (gepauzeerd)" : ""}</option>)}
                          </select>
                        ) : recipe ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tagColor(recipe.tag), flexShrink: 0 }} />
                              <button
                                onClick={() => (cook && !locked ? setAddingDay(dayKey) : setExpandedDay(expanded ? null : dayKey))}
                                className="day-card"
                                style={{ background: "none", border: "none", padding: 0, fontSize: 14.5, fontWeight: 500, cursor: "pointer", textAlign: "left", color: "#232823" }}
                              >
                                {recipe.name}
                              </button>
                              <button
                                onClick={() => setExpandedDay(expanded ? null : dayKey)}
                                aria-label="Ingrediënten en bereidingswijze tonen"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8570", padding: 6, margin: "-6px", display: "flex" }}
                              >
                                <BookOpen size={20} />
                              </button>
                            </div>
                            {recipe.prepMinutes && (
                              <div style={{ marginLeft: 14, fontSize: 11, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace" }}>
                                {recipe.prepMinutes} min
                              </div>
                            )}
                          </div>
                        ) : cook && !locked ? (
                          <button onClick={() => setAddingDay(dayKey)} className="day-card" style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: "#8A8570", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            <Plus size={14} /> Maaltijd toevoegen
                          </button>
                        ) : (
                          <span style={{ fontSize: 13.5, color: "#B5B096", fontStyle: "italic" }}>nog geen kookdag gepland</span>
                        )}
                      </div>
                      {cook && recipe && !locked && (
                        <button onClick={() => setCookDay(anchorKey, null)} aria-label="Maaltijd verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#B5583A", opacity: 0.6, padding: 4 }}>
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {expanded && recipe && (
                      <div style={{ padding: "0 4px 16px 58px" }}>
                        <div style={{ fontSize: 12.5, color: "#8A8570", fontFamily: "'JetBrains Mono', monospace", marginBottom: recipe.instructions ? 8 : 0 }}>
                          {recipe.ingredients.map(([n, q]) => `${n} ${q}`).join(" · ")}
                        </div>
                        {recipe.instructions && (
                          <div style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.55 }}>
                            {recipe.instructions}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {reviewOpen && (
              <Modal onClose={() => setReviewOpen(false)}>
                <WeekReview
                  recipes={weekRecipes}
                  onClose={() => setReviewOpen(false)}
                  onDeleteRecipe={removeRecipe}
                  onSuspendRecipe={suspendRecipe}
                />
              </Modal>
            )}

            {/* Boodschappenlijst */}
            {planTab === "boodschappen" && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 13, color: "#8A8570", margin: "0 0 14px" }}>
                {groceryList.length === 0 ? "Plan bij Gerechten kookdagen om deze lijst te vullen." : `Samengesteld uit ${filledCookDayCount} kookdag${filledCookDayCount === 1 ? "" : "en"}.`}
              </p>
              {groceryList.length > 0 && (
                <>
                  <GroceryModeSlider mode={groceryMode} setMode={setGroceryMode} />
                  <GroceryStoreSummary byStore={groceryByStore} />
                  {STORE_ORDER.map((id) => groceryByStore[id].length > 0 && (
                    <StoreSection key={id} storeId={id} items={groceryByStore[id]} checked={checked} onToggle={toggleCheck} />
                  ))}
                  {groceryByStore.other.length > 0 && (
                    <StoreSection storeId="other" items={groceryByStore.other} checked={checked} onToggle={toggleCheck} />
                  )}
                </>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
