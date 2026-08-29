import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, X, Menu, Loader2, ChefHat, BookOpen, Carrot, MessageSquareText, Lock, Unlock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dstr, fmtDate, startOfWeek, addDays, COOK_DAYS, OPTIONAL_DAYS, isCookDay, anchorIdxFor, tagColor, STORE_DISPLAY_ORDER, assignStore, isRegular, isRecurringDue, DAY_NAMES } from "./lib.js";
import { fetchRecipesFromDb, resolveIngredientIds, suspendRecipe as suspendRecipeApi, fetchRecurringItems, markRecurringItemBought } from "./api.js";
import { navBtnStyle, generateBtnStyle } from "./styles.js";
import RecipeManager from "./RecipeManager.jsx";
import IngredientManager from "./IngredientManager.jsx";
import { GroceryModeSlider, StoreSection, ListColumn } from "./GroceryList.jsx";
import Modal from "./Modal.jsx";
import WeekReview from "./WeekReview.jsx";
import MealPicker from "./MealPicker.jsx";
import ShoppingMode from "./ShoppingMode.jsx";

/* ---------- Design tokens ----------
   Palette: ledger / voorraadkast (pantry-notebook) thema
   - paper:    #EEEBE2
   - ink:      #232823
   - sage:     #5C7A5E  (accent - groente)
   - mustard:  #C99A3A  (accent - voorraad/granen; tint/decoratie)
   - rust:     #A75135  (vlees; ook alle destructieve/foutmeldingen-UI)
   - blue:     #4C7A9E  (vis; ook Albert Heijn in de boodschappenlijst)
   - purple:   #8B5FA6  (Ekoplaza in de boodschappenlijst)
   - line:     #C9C2AE
   Mustard doet in de boodschappenlijst dubbele dienst als Lidl-kleur; het
   Lidl-badge/tekst gebruikt een donkerdere ramptrede (#846526) voor
   voldoende contrast op tekstgrootte — de lichtere #C99A3A blijft de
   tint/decoratieve kleur.
   Type: display = Fraunces, body = Inter, mono = JetBrains Mono voor hoeveelheden

   Kookritme: maandag/woensdag/vrijdag plannen 2 dagen (kookdag + restjesdag),
   zondag plant 1 dag. Dinsdag/donderdag/zaterdag zijn restjesdagen die het
   recept van de voorgaande kookdag overnemen.
------------------------------------- */

export default function MealPlanner() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [history, setHistory] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [checked, setChecked] = useState({});
  const [saveErr, setSaveErr] = useState(false);
  const [dbOffline, setDbOffline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [addingDay, setAddingDay] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [view, setView] = useState("planner"); // "planner" | "recipes" | "ingredients"
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [availability, setAvailability] = useState({});
  const [groceryMode, setGroceryMode] = useState("bio"); // "bio" | "trips"
  const [ingredientNames, setIngredientNames] = useState([]);
  const [recipesPerUnit, setRecipesPerUnit] = useState({}); // name -> number
  const [recurringItems, setRecurringItems] = useState({}); // name -> {id, intervalWeeks, lastBoughtWeek}
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planTab, setPlanTab] = useState("gerechten"); // "gerechten" | "lijst" | "winkel" | "koken"
  const [locked, setLocked] = useState(false);

  const weekKey = "week:" + dstr(weekStart);
  const ingredientIdsRef = useRef(new Map());

  // Haalt recepten, planning, ingrediënten en beschikbaarheid op uit Supabase.
  // Er is geen lokale fallback-dataset meer: als dit mislukt blijft de app leeg
  // en expliciet "offline" (zie dbOffline) in plaats van stilletjes een oude,
  // hardgecodeerde receptenlijst te tonen alsof die actueel is. Ook herbruikt
  // door de "Opnieuw proberen"-knop hieronder.
  const loadInitialData = useCallback(async () => {
    try {
      const [recipesData, planRows, idRows, availabilityRows] = await Promise.all([
        fetchRecipesFromDb(),
        supabase.from("plan_days").select("day,recipe_id"),
        supabase.from("ingredients").select("id,name,recipes_per_unit"),
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
      setRecipesPerUnit(Object.fromEntries(idRows.data.map((i) => [i.name, i.recipes_per_unit])));
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
      try {
        const recurringRows = await fetchRecurringItems();
        const recurringMap = {};
        recurringRows.forEach((row) => {
          if (!row.ingredients) return;
          recurringMap[row.ingredients.name] = {
            id: row.ingredient_id, intervalWeeks: row.interval_weeks, lastBoughtWeek: row.last_bought_week,
          };
        });
        setRecurringItems(recurringMap);
      } catch { /* terugkerende items zijn optioneel, geen harde afhankelijkheid */ }
      setDbOffline(false);
    } catch {
      setDbOffline(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadInitialData();
      setLoading(false);
    })();
  }, [loadInitialData]);

  const retryConnection = async () => {
    setReconnecting(true);
    await loadInitialData();
    setReconnecting(false);
  };

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

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

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

  // Household staples (boter, koffie, wc papier...) bought on a fixed weekly
  // cadence regardless of whether any recipe calls for them this week — see
  // lib.js's isRecurringDue. A due item that's also a recipe ingredient this
  // week isn't duplicated; the recipe entry already covers it. Once checked
  // off this week it stays in the list (checked, like any other item) even
  // though checking it just made it "not due" — otherwise it would vanish
  // instead of showing the checkmark the user just tapped.
  //
  // Split into two tiers for the Lijst tab's "Gebruikelijk"/"Suggesties"
  // columns: a weekly item (brood, boter, koffie...) is near-certain to be
  // needed, so it starts unchecked like a normal ingredient; a longer-interval
  // item is a genuine guess about timing, so it starts checked/crossed-off by
  // default (see effectiveChecked below) — cheap to un-cross if it's wrong,
  // and doesn't clutter the list with items that turn out not to be needed.
  const dueRecurringEntries = useMemo(() => {
    const recipeNames = new Set(groceryList.map(([name]) => name));
    const weekStartStr = dstr(weekStart);
    const entries = [];
    Object.entries(recurringItems).forEach(([name, item]) => {
      if (recipeNames.has(name)) return;
      if (checked[name] || isRecurringDue(item.intervalWeeks, item.lastBoughtWeek, weekStartStr)) {
        entries.push([name, item.intervalWeeks === 1 ? "sure" : "suggestion"]);
      }
    });
    return entries;
  }, [groceryList, recurringItems, weekStart, checked]);

  const sureThingsList = useMemo(() =>
    dueRecurringEntries.filter(([, tier]) => tier === "sure").map(([name]) => [name, []]).sort(([a], [b]) => a.localeCompare(b)),
  [dueRecurringEntries]);

  const suggestionsList = useMemo(() =>
    dueRecurringEntries.filter(([, tier]) => tier === "suggestion").map(([name]) => [name, []]).sort(([a], [b]) => a.localeCompare(b)),
  [dueRecurringEntries]);

  const fullGroceryList = useMemo(() => {
    const map = new Map(groceryList);
    dueRecurringEntries.forEach(([name]) => map.set(name, []));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [groceryList, dueRecurringEntries]);

  // Wijst elk boodschappenlijst-item toe aan één winkel, afhankelijk van de
  // slider-stand. "bio": bio heeft voorrang boven winkelvolgorde (Lidl > AH >
  // Ekoplaza bio, en pas als nergens bio is de dichtstbijzijnde niet-bio optie).
  // "trips": winkelvolgorde heeft voorrang boven bio (eerste winkel die het
  // product sowieso heeft — bio of niet-bio — wordt gebruikt).
  const groceryByStore = useMemo(() => {
    const result = { lidl: [], ah: [], ekoplaza: [], other: [] };
    fullGroceryList.forEach(([name, qtys]) => {
      const { store, bio } = assignStore(availability[name], groceryMode);
      const item = { name, qtys, bio };
      (store ? result[store] : result.other).push(item);
    });
    return result;
  }, [fullGroceryList, availability, groceryMode]);

  // A "regular" (recipes_per_unit > isRegular's threshold — salt, soy sauce,
  // olive oil: something one purchase covers many recipes' worth of) starts
  // crossed off by default, on the assumption it's already in stock, rather
  // than being excluded from the list entirely — it's still a real recipe
  // ingredient this week, just presumed already at hand. Once the user
  // taps it (in either direction), that becomes an explicit, persisted
  // choice for this week and the default no longer applies.
  // A "suggestie" (a longer-interval recurring item — pindakaas, wc papier...)
  // starts crossed off by default too, same reasoning as a regular: it's a
  // guess about timing rather than a certainty, and early on there will be
  // false positives while the intervals get tuned, so the cheap default is
  // "assume not needed, one tap to correct" rather than cluttering the list.
  const effectiveChecked = useMemo(() => {
    const result = { ...checked };
    groceryList.forEach(([name]) => {
      if (checked[name] === undefined && isRegular(recipesPerUnit[name])) result[name] = true;
    });
    suggestionsList.forEach(([name]) => {
      if (checked[name] === undefined) result[name] = true;
    });
    return result;
  }, [checked, groceryList, recipesPerUnit, suggestionsList]);

  const toggleCheck = (name) => {
    const wasChecked = !!effectiveChecked[name];
    const next = { ...checked, [name]: !wasChecked };
    persistChecked(next, weekKey);
    const recurring = recurringItems[name];
    if (!wasChecked && recurring) {
      const weekStartStr = dstr(weekStart);
      setRecurringItems((prev) => ({ ...prev, [name]: { ...recurring, lastBoughtWeek: weekStartStr } }));
      markRecurringItemBought(recurring.id, weekStartStr).catch(() => setSaveErr(true));
    }
  };

  // Shopping mode: a distraction-free, single-store view meant to sit next
  // to that store's own app in split-screen. The item list is a snapshot
  // taken here, at open time, of what isn't checked off yet ("in stock"
  // items are excluded) — see ShoppingMode.jsx for why it stays a fixed
  // list from then on rather than live-filtering as items get checked.
  const [shoppingStore, setShoppingStore] = useState(null);
  const [shoppingItems, setShoppingItems] = useState([]);
  const openShoppingMode = (storeId) => {
    setShoppingItems(groceryByStore[storeId].filter((item) => !effectiveChecked[item.name]));
    setShoppingStore(storeId);
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

  const isThisWeek = dstr(weekStart) === dstr(startOfWeek(new Date()));

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#EEEBE2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" color="#5C7A5E" size={28} />
      </div>
    );
  }

  if (shoppingStore) {
    return (
      <ShoppingMode
        storeId={shoppingStore}
        items={shoppingItems}
        checked={checked}
        onToggle={toggleCheck}
        onClose={() => setShoppingStore(null)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#EEEBE2", fontFamily: "'Inter', system-ui, sans-serif", color: "#232823", paddingBottom: 48 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        .ledger-btn { transition: transform .15s ease; }
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
      <div style={{ borderBottom: "1px solid #C9C2AE", padding: "12px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <h1 style={{ margin: 0, maxWidth: "calc(100% - 120px)", minWidth: 0 }}>
            <button
              className="ledger-btn"
              onClick={() => setView("planner")}
              aria-label="Regel Het Eten — terug naar startscherm"
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0,
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", color: "#232823",
              }}
            >
              <Carrot size={16} color="#5C7A5E" style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>Regel Het Eten</span>
              <ChefHat size={16} color="#5C7A5E" style={{ flexShrink: 0 }} />
            </button>
          </h1>
          <button
            className="ledger-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            style={{ ...navBtnStyle, position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}
          >
            <Menu size={20} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, minWidth: 180,
                background: "#fff", border: "1px solid #C9C2AE", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(35,40,35,0.18)", overflow: "hidden",
              }}>
                <button
                  onClick={() => { setView((v) => (v === "ingredients" ? "planner" : "ingredients")); setMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px",
                    background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600,
                    color: "#232823", textAlign: "left",
                  }}
                >
                  <Carrot size={17} color="#5C7A5E" /> Ingrediënten
                </button>
                <div style={{ height: 1, background: "#E1DCC9" }} />
                <button
                  onClick={() => { setView((v) => (v === "recipes" ? "planner" : "recipes")); setMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px",
                    background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600,
                    color: "#232823", textAlign: "left",
                  }}
                >
                  <ChefHat size={17} color="#5C7A5E" /> Recepten
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {dbOffline && (
        <div style={{ background: "#A75135", color: "#fff", padding: "10px 20px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              Geen verbinding met de database — recepten en planning zijn niet geladen en wijzigingen worden niet opgeslagen.
            </p>
            <button
              className="ledger-btn"
              onClick={retryConnection}
              disabled={reconnecting}
              style={{
                background: "#fff", color: "#A75135", border: "none", borderRadius: 8,
                padding: "6px 14px", fontSize: 13, fontWeight: 700, flexShrink: 0,
                cursor: reconnecting ? "default" : "pointer", opacity: reconnecting ? 0.7 : 1,
              }}
            >
              {reconnecting ? "Verbinden…" : "Opnieuw proberen"}
            </button>
          </div>
        </div>
      )}

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
            offline={dbOffline}
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
                <div style={{ fontSize: 12, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace" }}>
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
                  ...generateBtnStyle, width: "auto", height: 44, padding: "0 16px", flex: 2, minWidth: 0,
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
                  height: 44, padding: "0 12px", borderRadius: 10, flex: 1, minWidth: 0,
                  border: "1px solid #C9C2AE", background: "#F7F5EE", color: "#232823",
                  fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6, cursor: weekRecipes.length === 0 ? "not-allowed" : "pointer",
                  opacity: weekRecipes.length === 0 ? 0.4 : 1,
                }}
              >
                <MessageSquareText size={16} /> Beoordeel weekplan
              </button>
            </div>
            {!locked && usableRecipes.length === 0 && !dbOffline && (
              <p style={{ fontSize: 12, color: "#6E6A59", marginTop: 8 }}>
                {recipes.length === 0 ? 'Voeg eerst een recept toe via "Recepten" rechtsboven.' : "Alle recepten staan gepauzeerd — pas er eentje aan om ze weer te kunnen plannen."}
              </p>
            )}
            {saveErr && (
              <p style={{ fontSize: 12, color: "#A75135", marginTop: 8 }}>
                Opslaan lukte net niet — je planning wordt mogelijk niet bewaard. Probeer het zo nog eens.
              </p>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 6, marginTop: 22, borderBottom: "1px solid #C9C2AE" }}>
              {[["gerechten", "Gerechten"], ["lijst", "Lijst"], ["winkel", "Winkel"], ["koken", "Koken"]].map(([id, label]) => (
                <button
                  key={id}
                  className="ledger-btn"
                  onClick={() => setPlanTab(id)}
                  style={{
                    flex: 1, background: "none", border: "none", cursor: "pointer", padding: "10px 0",
                    fontSize: 14.5, fontWeight: 700, color: planTab === id ? "#232823" : "#6E6A59",
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
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#6E6A59" }}>{DAY_NAMES[i]}</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16 }}>{d.getDate()}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {recipe ? (
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
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#6E6A59", padding: 6, margin: "-6px", display: "flex" }}
                              >
                                <BookOpen size={20} />
                              </button>
                            </div>
                            {recipe.prepMinutes && (
                              <div style={{ marginLeft: 14, fontSize: 11, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace" }}>
                                {recipe.prepMinutes} min
                              </div>
                            )}
                          </div>
                        ) : cook && !locked ? (
                          <button onClick={() => setAddingDay(dayKey)} className="day-card" style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: "#6E6A59", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            <Plus size={14} /> Maaltijd toevoegen
                          </button>
                        ) : (
                          <span style={{ fontSize: 13.5, color: "#6E6A59", fontStyle: "italic" }}>nog geen kookdag gepland</span>
                        )}
                      </div>
                      {cook && recipe && !locked && (
                        <button onClick={() => setCookDay(anchorKey, null)} aria-label="Maaltijd verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", opacity: 0.6, padding: 4 }}>
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {expanded && recipe && (
                      <div style={{ padding: "0 4px 16px 58px" }}>
                        <div style={{ fontSize: 12.5, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace", marginBottom: recipe.instructions ? 8 : 0 }}>
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

            {addingDay && (
              <MealPicker
                recipes={recipes}
                onSelect={(id) => setCookDay(addingDay, id)}
                onCancel={() => setAddingDay(null)}
              />
            )}

            {/* Lijst: recepten, vaste boodschappen en suggesties naast elkaar */}
            {planTab === "lijst" && (
            <div style={{ marginTop: 18 }}>
              {fullGroceryList.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6E6A59", margin: 0 }}>
                  Plan bij Gerechten kookdagen om deze lijst te vullen.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <ListColumn title="Ingrediënten" items={groceryList} checked={effectiveChecked} onToggle={toggleCheck} />
                  <ListColumn title="Gebruikelijk" items={sureThingsList} checked={effectiveChecked} onToggle={toggleCheck} />
                  <ListColumn title="Suggesties" items={suggestionsList} checked={effectiveChecked} onToggle={toggleCheck} />
                </div>
              )}
            </div>
            )}

            {/* Winkel (boodschappenlijst) */}
            {planTab === "winkel" && (
            <div style={{ marginTop: 18 }}>
              {fullGroceryList.length === 0 && (
                <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 14px" }}>
                  Plan bij Gerechten kookdagen om deze lijst te vullen.
                </p>
              )}
              {fullGroceryList.length > 0 && (
                <>
                  <GroceryModeSlider mode={groceryMode} setMode={setGroceryMode} />
                  {STORE_DISPLAY_ORDER.map((id) => groceryByStore[id].length > 0 && (
                    <StoreSection key={id} storeId={id} items={groceryByStore[id]} checked={effectiveChecked} onToggle={toggleCheck} onShop={openShoppingMode} />
                  ))}
                  {groceryByStore.other.length > 0 && (
                    <StoreSection storeId="other" items={groceryByStore.other} checked={effectiveChecked} onToggle={toggleCheck} />
                  )}
                </>
              )}
            </div>
            )}

            {/* Koken (placeholder, geen inhoud nog) */}
            {planTab === "koken" && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 13.5, color: "#6E6A59", fontStyle: "italic" }}>Binnenkort beschikbaar.</p>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
