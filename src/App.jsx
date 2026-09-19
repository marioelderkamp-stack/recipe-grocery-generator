import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Minus, X, Menu, Loader2, ChefHat, Book, BookOpen, Carrot, Beef, Fish, ShoppingCart, MessageSquareText, Lock, Unlock, Pencil, Search, ArrowDown, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { dstr, fmtDate, startOfWeek, addDays, defaultPersonsForSpan, EVENING_PERSONS, prepConstraintForDay, matchesPrepConstraint, tagColor, STORE_DISPLAY_ORDER, assignStore, isRegular, isRecurringDue, compareByAisle, pickRandomRecipe, RECIPE_NAME_MAX_LENGTH, toPerPerson, toReferenceSix, scaleQuantity, scaleQuantityForShopping } from "./lib.js";
import { DEFAULT_RECIPES, DAY_NAMES } from "./data.js";
import { fetchRecipesFromDb, resolveIngredientIds, suspendRecipe as suspendRecipeApi, fetchRecurringItems, addGroceryOverride, removeGroceryOverride, setIngredientAisleCategory, setIngredientAvailability, updateDayPersons, updateDaySide, updateDaySidePersons, updateDayTwoDay } from "./api.js";
import { navBtnStyle, generateBtnStyle, inputStyle } from "./styles.js";

// Icon shown next to a recipe's name in the day-grid, replacing what used to
// be a plain color dot — Beef/Fish for vlees/vis, Carrot as the default
// (covers "veg" and anything untagged), colored via tagColor.
const TAG_ICONS = { vlees: Beef, vis: Fish };

// Height of Lijst's "voeg item toe" search bar — the add ("+") button and
// each pending Zelf toegevoegd row's confirm checkmark are sized to match.
const ADD_BTN_SIZE = 40;
import RecipeManager from "./RecipeManager.jsx";
import RecipeForm from "./RecipeForm.jsx";
import IngredientManager from "./IngredientManager.jsx";
import { GroceryModeSlider, StoreSection, ListColumn, ExtraItemsSection, CompleteList } from "./GroceryList.jsx";
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
   Type: display = Abril Fatface, body = Manrope, mono = JetBrains Mono voor hoeveelheden

   Kookritme: elke dag plant standaard zijn eigen, onafhankelijke gerecht. Een
   dag kan met een eigen knop als "2-daagse variant" gemarkeerd worden — dan
   neemt de eerstvolgende dag dat gerecht over (een "tweede dag"), in plaats
   van zelf iets te plannen.
------------------------------------- */

export default function MealPlanner() {
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [history, setHistory] = useState({});
  const [recipes, setRecipes] = useState(DEFAULT_RECIPES);
  const [checked, setChecked] = useState({});
  // Ad-hoc items added directly to this week's list via Lijst's "voeg item
  // toe" bar, keyed by ingredient name -> true. Persisted per week in
  // grocery_overrides (action: "include"), separate from recipe-derived and
  // recurring items — see the groceryList memo below for how they're merged
  // in.
  const [extraItems, setExtraItems] = useState({});
  // Items typed into the "voeg item toe" bar that haven't been confirmed
  // yet — shown in Zelf toegevoegd as editable "nieuw" rows, but not
  // written anywhere (no ingredient row, no grocery_overrides row) until
  // the row's checkmark is pressed. See confirmPendingItem below.
  const [pendingExtraItems, setPendingExtraItems] = useState([]); // [{id, name, aisleCategory, availability}]
  const [saveErr, setSaveErr] = useState(false);
  const [addingDay, setAddingDay] = useState(null);
  // Set only when the picker was opened by tapping an already-assigned cook
  // day's name (a "swap" rather than a first-time "add") — MealPicker uses
  // this to show that recipe as the sole suggestion instead of the full list
  // until something's typed.
  const [swappingRecipe, setSwappingRecipe] = useState(null);
  // Carries whatever was typed into a day's inline search box across the
  // handoff to the full-screen MealPicker, so the transition (see
  // inlineSearchDay below) continues the search instead of restarting it.
  const [pendingQuery, setPendingQuery] = useState("");
  // A cook day's recipe name renders as a closed, search-bar-styled button
  // until tapped; tapping swaps it for a real, focused input showing just
  // the current recipe as a suggestion — only once the user actually types
  // does that escalate to the full-screen picker (see the input's onChange
  // in the day-grid below). Only one day can have this open at a time.
  const [inlineSearchDay, setInlineSearchDay] = useState(null);
  const [inlineQuery, setInlineQuery] = useState("");
  // Same trio as addingDay/swappingRecipe/pendingQuery above, but for
  // searching a specific side dish instead of a main — kept separate so a
  // main search and a side search never fight over the same MealPicker state.
  const [addingSideDay, setAddingSideDay] = useState(null);
  const [swappingSide, setSwappingSide] = useState(null);
  const [pendingSideQuery, setPendingSideQuery] = useState("");
  // Same trio as inlineSearchDay/inlineQuery above, but for a side's own name.
  const [sideInlineSearchDay, setSideInlineSearchDay] = useState(null);
  const [sideInlineQuery, setSideInlineQuery] = useState("");
  const [expandedDay, setExpandedDay] = useState(null);
  // Long-press "pick up" a day's own dish to swap it with another day's, or
  // drag it onto the remove zone to drop it — only ever available on an
  // independent day (its own dish, not a borrowed "Tweede dag") while the
  // week's unlocked. pickedUpDay is which day is currently lifted;
  // dragOverTarget is whatever's currently under the finger — another
  // day's key, "remove", or null. See handleRecipePressStart below.
  const [pickedUpDay, setPickedUpDay] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [view, setView] = useState("planner"); // "planner" | "recipes" | "ingredients"
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [availability, setAvailability] = useState({});
  const [groceryMode, setGroceryMode] = useState("bio"); // "bio" | "trips" | "all"
  const [ingredientNames, setIngredientNames] = useState([]);
  const [recipesPerUnit, setRecipesPerUnit] = useState({}); // name -> number
  const [aisleCategory, setAisleCategory] = useState({}); // name -> category | null
  const [recurringItems, setRecurringItems] = useState({}); // name -> {id, intervalWeeks, lastBoughtWeek}
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planTab, setPlanTab] = useState("gerechten"); // "gerechten" | "lijst" | "winkel" | "koken"
  const [addItemQuery, setAddItemQuery] = useState("");
  const [addItemSuggestOpen, setAddItemSuggestOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  // A planned day's own "aantal personen" (day -> number), only ever set
  // alongside a recipe assignment — a day without an entry here defaults to
  // defaultPersonsForDay. See contributingDays below for how this and
  // history combine to decide what a leftover day actually needs.
  const [dayPersons, setDayPersons] = useState({});
  // A day's own side dish (soup/salad/sushi...), day -> recipe id. Only ever
  // set on a day that already has its own main (see contributingDays below —
  // sides never inherit from a tweede dag's cook day the way its own recipe
  // does; each independently-contributing day has, at most, its own side).
  const [sideHistory, setSideHistory] = useState({});
  // A side's own "aantal personen", day -> number — defaults to
  // EVENING_PERSONS (3) when unset, since a side is portioned per evening
  // regardless of how many evenings its day's main batch covers.
  const [sidePersons, setSidePersons] = useState({});
  // Whether a day's own dish is a "2-daagse variant" (day -> boolean) —
  // only meaningful on a day that already has its own recipe. When true,
  // the very next calendar day inherits this day's dish instead of
  // planning its own (see contributingDays/the day-grid below for how this
  // drives inheritance) — the only remaining way one day's plan carries
  // into another's, now that every day defaults to independent.
  const [twoDayDays, setTwoDayDays] = useState({});

  const weekKey = "week:" + dstr(weekStart);
  const ingredientIdsRef = useRef(new Map());
  const pendingIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [recipesData, planRows, idRows, availabilityRows] = await Promise.all([
          fetchRecipesFromDb(),
          supabase.from("plan_days").select("day,recipe_id,persons,side_recipe_id,side_persons,two_day"),
          supabase.from("ingredients").select("id,name,recipes_per_unit,aisle_category"),
          supabase.from("ingredient_availability").select("supermarket_id,status,ingredients(name)"),
        ]);
        if (planRows.error) throw planRows.error;
        if (idRows.error) throw idRows.error;
        setRecipes(recipesData);
        const historyMap = {};
        const personsMap = {};
        const sideMap = {};
        const sidePersonsMap = {};
        const twoDayMap = {};
        planRows.data.forEach((row) => {
          if (row.recipe_id) historyMap[row.day] = row.recipe_id;
          if (row.persons) personsMap[row.day] = row.persons;
          if (row.side_recipe_id) sideMap[row.day] = row.side_recipe_id;
          if (row.side_persons) sidePersonsMap[row.day] = row.side_persons;
          if (row.two_day) twoDayMap[row.day] = true;
        });
        setHistory(historyMap);
        setDayPersons(personsMap);
        setSideHistory(sideMap);
        setSidePersons(sidePersonsMap);
        setTwoDayDays(twoDayMap);
        ingredientIdsRef.current = new Map(idRows.data.map((i) => [i.name, i.id]));
        setIngredientNames(idRows.data.map((i) => i.name));
        setRecipesPerUnit(Object.fromEntries(idRows.data.map((i) => [i.name, i.recipes_per_unit])));
        setAisleCategory(Object.fromEntries(idRows.data.map((i) => [i.name, i.aisle_category])));
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
      } catch {
        setRecipes(DEFAULT_RECIPES);
        setHistory({});
        setDayPersons({});
        setSideHistory({});
        setSidePersons({});
        setTwoDayDays({});
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
        const { data, error } = await supabase
          .from("grocery_overrides")
          .select("action, ingredients(name)")
          .eq("week_start", dstr(weekStart))
          .eq("action", "include");
        if (error) throw error;
        const map = {};
        data.forEach((row) => { if (row.ingredients) map[row.ingredients.name] = true; });
        setExtraItems(map);
      } catch { setExtraItems({}); }
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

  // A side can only ever be set on a day that already has its own plan_days
  // row (its main) — never an insert/delete of the row itself, just an
  // UPDATE of side_recipe_id, one call per changed day (see updateDaySide).
  const persistSideHistory = useCallback(async (next) => {
    const prevMap = sideHistory;
    setSideHistory(next);
    try {
      const days = new Set([...Object.keys(prevMap), ...Object.keys(next)]);
      const changed = [...days].filter((day) => prevMap[day] !== next[day]);
      await Promise.all(changed.map((day) => updateDaySide(day, next[day] ?? null)));
    } catch { setSaveErr(true); }
  }, [sideHistory]);

  // A day's own "2-daagse variant" flag — only ever toggled on a day that
  // already has its own plan_days row (its main), so this is always an
  // UPDATE of two_day, one call per changed day, same shape as
  // persistSideHistory above.
  const persistTwoDayDays = useCallback(async (next) => {
    const prevMap = twoDayDays;
    setTwoDayDays(next);
    try {
      const days = new Set([...Object.keys(prevMap), ...Object.keys(next)]);
      const changed = [...days].filter((day) => !!prevMap[day] !== !!next[day]);
      await Promise.all(changed.map((day) => updateDayTwoDay(day, !!next[day])));
    } catch { setSaveErr(true); }
  }, [twoDayDays]);

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
  // "course" splits a recipe into a standalone main or a side (soep, salade,
  // sushi...) meant to accompany one — usableRecipes (mains) is what "Maak
  // weekplan"/the dice reroll pick from; a side is never picked as a day's
  // own main. See usableSideRecipes below for its side-only counterpart.
  const usableRecipes = useMemo(() => recipes.filter((r) => !r.suspended && r.course !== "side"), [recipes]);
  const usableSideRecipes = useMemo(() => recipes.filter((r) => !r.suspended && r.course === "side"), [recipes]);
  // MealPicker's own search list — every non-side recipe including paused
  // ones (still shown there, just labeled "(gepauzeerd)"), unlike
  // usableRecipes above which the automatic pickers draw from.
  const mainSearchableRecipes = useMemo(() => recipes.filter((r) => r.course !== "side"), [recipes]);
  const sideSearchableRecipes = useMemo(() => recipes.filter((r) => r.course === "side"), [recipes]);

  const recentlyUsedSides = useMemo(() => {
    const cutoff = addDays(weekStart, -21);
    const used = new Set();
    Object.entries(sideHistory).forEach(([k, v]) => {
      const d = new Date(k);
      if (d >= cutoff && d < weekStart) used.add(v);
    });
    return used;
  }, [sideHistory, weekStart]);

  // Gives every calendar day its own independent dish and, where
  // recommended, its own side — a full regenerate starts the week fresh,
  // so any existing "2-daagse variant" flags are cleared along with it
  // rather than left pointing at meals that just got replaced.
  const generateWeek = async () => {
    if (usableRecipes.length === 0) return;
    const avoid = new Set(recentlyUsed);
    const avoidSides = new Set(recentlyUsedSides);
    // Start from the existing maps (which span every week ever loaded, not
    // just this one) so persistHistory/persistSideHistory's diffing doesn't
    // read another week's untouched days as removed — only this week's 7
    // keys actually get overwritten below.
    const next = { ...history };
    const nextSide = { ...sideHistory };
    weekDates.forEach((d) => delete nextSide[dstr(d)]);
    const chosenThisWeek = new Set();
    const chosenSidesThisWeek = new Set();

    weekDates.forEach((d, i) => {
      const key = dstr(d);
      const constraint = prepConstraintForDay(i);
      let pool = usableRecipes.filter((r) => matchesPrepConstraint(r.prepMinutes, constraint));
      if (pool.length === 0) pool = usableRecipes;
      const pick = pickRandomRecipe(pool, new Set([...avoid, ...chosenThisWeek]));
      next[key] = pick.id;
      chosenThisWeek.add(pick.id);

      if (pick.sideRecommended && usableSideRecipes.length > 0) {
        const sidePick = pickRandomRecipe(usableSideRecipes, new Set([...avoidSides, ...chosenSidesThisWeek]));
        nextSide[key] = sidePick.id;
        chosenSidesThisWeek.add(sidePick.id);
      }
    });
    await persistHistory(next);
    await persistSideHistory(nextSide);
    // Clear this week's own 2-daagse flags too (again, only this week's —
    // twoDayDays spans every week ever loaded, same reasoning as above).
    const weekKeys = weekDates.map((d) => dstr(d));
    if (weekKeys.some((k) => twoDayDays[k])) {
      const nextTwoDay = { ...twoDayDays };
      weekKeys.forEach((k) => delete nextTwoDay[k]);
      await persistTwoDayDays(nextTwoDay);
    }
  };

  const setCookDay = async (key, recipeId) => {
    const next = { ...history, [key]: recipeId || undefined };
    if (!recipeId) delete next[key];
    await persistHistory(next);
    if (!recipeId) {
      // Removing a day's own main leaves nothing for its own side to go
      // with — clear it too. If this day was a "2-daagse variant" (spans
      // the next calendar day) and that next day hasn't diverged into its
      // own separate meal, the whole two-day meal just disappeared, not
      // just this one day's plate, so its side goes too; a diverged next
      // day keeps its own side regardless — removing its own pick here
      // just reverts its main back to inheriting, not to "no meal at all".
      const idx = weekDates.findIndex((d) => dstr(d) === key);
      const nextSideMap = { ...sideHistory };
      let sideChanged = false;
      if (sideHistory[key] !== undefined) { delete nextSideMap[key]; sideChanged = true; }
      if (idx !== -1 && idx < 6 && twoDayDays[key]) {
        const nextDayKey = dstr(weekDates[idx + 1]);
        if (next[nextDayKey] === undefined && sideHistory[nextDayKey] !== undefined) {
          delete nextSideMap[nextDayKey];
          sideChanged = true;
        }
      }
      if (sideChanged) await persistSideHistory(nextSideMap);
      // Nothing left for a "2-daagse variant" flag to span either.
      if (twoDayDays[key]) await persistTwoDayDays({ ...twoDayDays, [key]: false });
    } else {
      // Giving this day its own explicit dish means it's no longer
      // inheriting from the day before — if that day was marked as a
      // "2-daagse variant" spanning into this one, clear the flag rather
      // than leave it dangling underneath this day's own pick. Otherwise
      // it silently "comes back" (this day reverts to inheriting again)
      // the next time this day's own pick gets removed, which reads as two
      // dishes fighting over the same day.
      const idx = weekDates.findIndex((d) => dstr(d) === key);
      if (idx > 0) {
        const prevKey = dstr(weekDates[idx - 1]);
        if (twoDayDays[prevKey]) await persistTwoDayDays({ ...twoDayDays, [prevKey]: false });
      }
    }
    setAddingDay(null);
    setSwappingRecipe(null);
    setPendingQuery("");
  };

  // Same "avoid what's already spoken for" logic as generateWeek, just for
  // one day at a time — avoids repeating a recently-used recipe or one
  // already picked elsewhere this week, so re-rolling one day doesn't create
  // an accidental duplicate with another day.
  const randomizeDay = async (dayKey) => {
    if (usableRecipes.length === 0) return;
    const avoid = new Set(recentlyUsed);
    weekDates.forEach((d) => {
      const k = dstr(d);
      if (k !== dayKey && history[k]) avoid.add(history[k]);
    });
    const pick = pickRandomRecipe(usableRecipes, avoid);
    if (!pick) return;
    await setCookDay(dayKey, pick.id);
    // Same side-recommended handling as generateWeek's own per-day pick:
    // a side-recommended dish gets a fresh random side of its own (never
    // repeating one already in play elsewhere this week), and a dish
    // without the flag has none — clearing whatever side this day
    // happened to have before, rather than leaving it stranded on an
    // unrelated new main.
    if (pick.sideRecommended && usableSideRecipes.length > 0) {
      const avoidSides = new Set(recentlyUsedSides);
      weekDates.forEach((d) => {
        const k = dstr(d);
        if (k !== dayKey && sideHistory[k]) avoidSides.add(sideHistory[k]);
      });
      const sidePick = pickRandomRecipe(usableSideRecipes, avoidSides);
      if (sidePick) await persistSideHistory({ ...sideHistory, [dayKey]: sidePick.id });
    } else if (sideHistory[dayKey] !== undefined) {
      await removeSide(dayKey);
    }
  };

  // The 2-daagse-variant toggle — only meaningful on a day that already has
  // its own recipe (see the day-grid below, which only renders this on an
  // "independent" day), so it's always a flip of that one day's own flag.
  const toggleTwoDay = async (dayKey) => {
    const turningOn = !twoDayDays[dayKey];
    const idx = weekDates.findIndex((d) => dstr(d) === dayKey);
    const nextDayKey = idx !== -1 && idx < 6 ? dstr(weekDates[idx + 1]) : null;
    // Turning this day into a 2-daagse variant means the day right after it
    // should show this day's dish, not whatever it had of its own —
    // actually overwrite it rather than leaving that pick sitting there
    // unseen until something else touches it.
    const overwritesNextDay = turningOn && nextDayKey && history[nextDayKey] !== undefined;
    if (overwritesNextDay) {
      const nextHistory = { ...history };
      delete nextHistory[nextDayKey];
      await persistHistory(nextHistory);
      // Nothing left for its own side to go with either.
      if (sideHistory[nextDayKey] !== undefined) {
        const nextSideMap = { ...sideHistory };
        delete nextSideMap[nextDayKey];
        await persistSideHistory(nextSideMap);
      }
    }
    // Both flag changes (this day turning on/off, and the overwritten next
    // day's own flag clearing) go into one persistTwoDayDays call — two
    // separate calls off the same pre-update twoDayDays would each diff
    // against a stale snapshot and the second would silently clobber the
    // first's local state update.
    const nextTwoDayDays = { ...twoDayDays, [dayKey]: turningOn };
    if (overwritesNextDay && twoDayDays[nextDayKey]) nextTwoDayDays[nextDayKey] = false;
    await persistTwoDayDays(nextTwoDayDays);
  };

  // What a day actually shows — its own dish, or (lacking one) whatever
  // it's inheriting from the day before. Mirrors the day-grid render
  // loop's own `effectiveRecipeId`, but as a standalone lookup for
  // swapDays below, which needs it for an arbitrary pair of days rather
  // than the one currently being rendered.
  const getEffectiveRecipeId = (dayKey) => {
    const ownRid = history[dayKey];
    if (ownRid !== undefined) return ownRid;
    const idx = weekDates.findIndex((d) => dstr(d) === dayKey);
    const prevKey = idx > 0 ? dstr(weekDates[idx - 1]) : null;
    if (prevKey && twoDayDays[prevKey] && history[prevKey] !== undefined) return history[prevKey];
    return undefined;
  };

  // Picking up a day (see handleRecipePressStart above) and dropping it on
  // another swaps what the two days show — dayA's dish becomes whatever
  // dayB had (and vice versa), each keeping its own persons/side/2-daagse
  // status; dropping on a day with nothing of its own degenerates into a
  // plain move, since dayA then just inherits "nothing" in return. Only
  // ever called with dayA an independent day (the only kind that can be
  // picked up), so dayA's own effective recipe is always defined.
  const swapDays = async (dayA, dayB) => {
    if (dayA === dayB) return;
    const effA = getEffectiveRecipeId(dayA);
    const effB = getEffectiveRecipeId(dayB);
    if (effA === undefined) return;

    const bWasOwnEntry = history[dayB] !== undefined;
    const nextHistory = { ...history };
    if (effB !== undefined) nextHistory[dayA] = effB; else delete nextHistory[dayA];
    nextHistory[dayB] = effA;
    await persistHistory(nextHistory);

    // dayB now has its own entry either way — if it didn't before (it was
    // borrowing from the day before it), it's diverging, so whatever day
    // it was borrowing from no longer spans into it (same cleanup
    // setCookDay's own divergence path does).
    const nextTwoDay = { ...twoDayDays };
    let twoDayChanged = false;
    if (!bWasOwnEntry) {
      const idxB = weekDates.findIndex((d) => dstr(d) === dayB);
      const prevOfB = idxB > 0 ? dstr(weekDates[idxB - 1]) : null;
      if (prevOfB && twoDayDays[prevOfB]) { nextTwoDay[prevOfB] = false; twoDayChanged = true; }
    }

    // dayA only ends up empty when dayB had nothing of its own (a move,
    // not a swap) — same cascade as setCookDay's own removal: its side
    // goes, its own 2-daagse flag goes, and if it was itself spanning
    // forward into a day with no separate pick, that day's side goes too.
    const nextSideMap = { ...sideHistory };
    let sideChanged = false;
    if (effB === undefined) {
      if (sideHistory[dayA] !== undefined) { delete nextSideMap[dayA]; sideChanged = true; }
      const idxA = weekDates.findIndex((d) => dstr(d) === dayA);
      if (idxA !== -1 && idxA < 6 && twoDayDays[dayA]) {
        const afterA = dstr(weekDates[idxA + 1]);
        if (nextHistory[afterA] === undefined && sideHistory[afterA] !== undefined) {
          delete nextSideMap[afterA];
          sideChanged = true;
        }
      }
      if (twoDayDays[dayA]) { nextTwoDay[dayA] = false; twoDayChanged = true; }
    }

    if (sideChanged) await persistSideHistory(nextSideMap);
    if (twoDayChanged) await persistTwoDayDays(nextTwoDay);
  };

  // The side's own reroll — separate from randomizeDay above (rerolling the
  // main never touches the side, and vice versa) and available on every
  // independent day regardless of side_recommended, so a main without it can
  // still get a side if the user asks for one here. Avoids repeating the
  // day's current side or one already picked elsewhere this week.
  const randomizeSide = async (dayKey) => {
    if (usableSideRecipes.length === 0) return;
    const avoid = new Set();
    if (sideHistory[dayKey]) avoid.add(sideHistory[dayKey]);
    weekDates.forEach((d) => {
      const k = dstr(d);
      if (k !== dayKey && sideHistory[k]) avoid.add(sideHistory[k]);
    });
    const pick = pickRandomRecipe(usableSideRecipes, avoid);
    if (pick) await persistSideHistory({ ...sideHistory, [dayKey]: pick.id });
  };

  const removeSide = async (dayKey) => {
    const next = { ...sideHistory };
    delete next[dayKey];
    await persistSideHistory(next);
    // A future side picked for this day should start fresh at the default
    // headcount, not silently inherit a completely different dish's count.
    if (sidePersons[dayKey] !== undefined) {
      setSidePersons((prev) => { const next = { ...prev }; delete next[dayKey]; return next; });
    }
  };

  // Same pick-up-and-drag swap as swapDays above, but for a day's side —
  // much simpler, since a side never inherits from the day before the way
  // a main can (see sideContributingDays: every day's side is purely its
  // own), so there's no divergence/2-daagse cascade to replicate here, just
  // a straight exchange of each day's own sideHistory entry. Each day
  // keeps its own sidePersons regardless — only the dish itself moves,
  // same as a main swap leaves dayPersons alone. Refuses to drop onto a
  // day with no main of its own to accompany, since there'd be nowhere in
  // the UI to show it until that day got one.
  const swapSideDays = async (dayA, dayB) => {
    if (dayA === dayB) return;
    const sideA = sideHistory[dayA];
    if (sideA === undefined) return;
    if (getEffectiveRecipeId(dayB) === undefined) return;
    const sideB = sideHistory[dayB];
    const nextSideMap = { ...sideHistory };
    if (sideB !== undefined) nextSideMap[dayA] = sideB; else delete nextSideMap[dayA];
    nextSideMap[dayB] = sideA;
    await persistSideHistory(nextSideMap);
    if (sideB === undefined && sidePersons[dayA] !== undefined) {
      setSidePersons((prev) => { const next = { ...prev }; delete next[dayA]; return next; });
    }
  };

  // MealPicker's own onSelect when it was opened for a side (addingSideDay
  // set) rather than a main (addingDay) — see the shared MealPicker render
  // below for how the two are told apart.
  const selectSideFromPicker = async (dayKey, recipeId) => {
    await persistSideHistory({ ...sideHistory, [dayKey]: recipeId });
    setAddingSideDay(null);
    setSwappingSide(null);
    setPendingSideQuery("");
  };

  // A day's own "aantal personen" — only ever changed from the expanded
  // view of a day that already has a recipe (and so already has its own
  // plan_days row), so this is always an update, never an upsert.
  const setDayPersonsValue = async (dayKey, persons) => {
    const clamped = Math.max(1, Math.round(persons));
    setDayPersons((prev) => ({ ...prev, [dayKey]: clamped }));
    try {
      await updateDayPersons(dayKey, clamped);
    } catch { setSaveErr(true); }
  };

  // A side's own "aantal personen", independent of its day's main — see
  // updateDaySidePersons for why this upserts rather than only updating.
  const setSidePersonsValue = async (dayKey, persons) => {
    const clamped = Math.max(1, Math.round(persons));
    setSidePersons((prev) => ({ ...prev, [dayKey]: clamped }));
    try {
      await updateDaySidePersons(dayKey, clamped);
    } catch { setSaveErr(true); }
  };

  // Days that independently put a dish on the table this week: every day
  // with its own history entry. A day without one is inheriting its meal
  // from the previous calendar day (only possible when that previous day is
  // marked as a "2-daagse variant" — see the day-grid below) and
  // contributes nothing of its own; it's the same batch, already counted
  // once there.
  const contributingDays = useMemo(() => {
    const result = [];
    weekDates.forEach((d) => {
      const dayKey = dstr(d);
      const ownRid = history[dayKey];
      if (ownRid) result.push({ dayKey, recipeId: ownRid });
    });
    return result;
  }, [history, weekDates]);

  // Unlike its main, a day's side is never shared with the day it hands its
  // main off to — a two-day casserole almost always wants a *different*
  // side each evening, so every calendar day picks (or inherits nothing
  // for) its own, regardless of whether that day's main itself is
  // independent or inherited. Only counted when the day actually has a meal
  // to go with — own or inherited — so a leftover side from a
  // since-removed main doesn't linger in the shopping list.
  const sideContributingDays = useMemo(() => {
    const result = [];
    weekDates.forEach((d, i) => {
      const dayKey = dstr(d);
      const sideRecipeId = sideHistory[dayKey];
      if (!sideRecipeId) return;
      const prevKey = i > 0 ? dstr(weekDates[i - 1]) : null;
      const hasMeal = history[dayKey] !== undefined || (prevKey && twoDayDays[prevKey] && history[prevKey] !== undefined);
      if (hasMeal) result.push({ dayKey, sideRecipeId, persons: sidePersons[dayKey] ?? EVENING_PERSONS });
    });
    return result;
  }, [sideHistory, history, sidePersons, weekDates, twoDayDays]);

  // Ingredient amounts are stored per person — each contributing day scales
  // its recipe by its own "aantal personen" (dayPersons, default
  // defaultPersonsForSpan of that day's own 2-daagse flag) before the
  // amounts get summed and rounded to a buyable quantity (see
  // aggregateQuantities in lib.js).
  const groceryList = useMemo(() => {
    const map = {};
    contributingDays.forEach(({ dayKey, recipeId }) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      const persons = dayPersons[dayKey] ?? defaultPersonsForSpan(twoDayDays[dayKey]);
      recipe.ingredients.forEach(([name, perPersonQty]) => {
        if (!map[name]) map[name] = [];
        map[name].push(scaleQuantity(perPersonQty, persons));
      });
    });
    // A side has its own "aantal personen" (default EVENING_PERSONS),
    // independent of its day's own main — which may be a much larger shared
    // batch (see sideContributingDays above for why sides never inherit
    // across days).
    sideContributingDays.forEach(({ sideRecipeId, persons }) => {
      const side = recipes.find((r) => r.id === sideRecipeId);
      if (!side) return;
      side.ingredients.forEach(([name, perPersonQty]) => {
        if (!map[name]) map[name] = [];
        map[name].push(scaleQuantity(perPersonQty, persons));
      });
    });
    return Object.entries(map).sort(compareByAisle(aisleCategory));
  }, [contributingDays, sideContributingDays, recipes, aisleCategory, dayPersons, twoDayDays]);

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
      // An item already sitting in Zelf toegevoegd this week doesn't also
      // need a Gebruikelijk/Suggesties entry — the manual add covers it.
      if (recipeNames.has(name) || extraItems[name]) return;
      if (checked[name] || isRecurringDue(item.intervalWeeks, item.lastBoughtWeek, weekStartStr)) {
        entries.push([name, item.intervalWeeks === 1 ? "sure" : "suggestion"]);
      }
    });
    return entries;
  }, [groceryList, recurringItems, weekStart, checked, extraItems]);

  const sureThingsList = useMemo(() =>
    dueRecurringEntries.filter(([, tier]) => tier === "sure").map(([name]) => [name, []]).sort(compareByAisle(aisleCategory)),
  [dueRecurringEntries, aisleCategory]);

  const suggestionsList = useMemo(() =>
    dueRecurringEntries.filter(([, tier]) => tier === "suggestion").map(([name]) => [name, []]).sort(compareByAisle(aisleCategory)),
  [dueRecurringEntries, aisleCategory]);

  const fullGroceryList = useMemo(() => {
    const map = new Map(groceryList);
    dueRecurringEntries.forEach(([name]) => map.set(name, []));
    // Zelf toegevoegd items feed Winkel the same as anything else — they
    // just don't render inside the Ingrediënten column (see the "Zelf
    // toegevoegd" section in the Lijst tab below).
    Object.keys(extraItems).forEach((name) => { if (!map.has(name)) map.set(name, []); });
    return [...map.entries()].sort(compareByAisle(aisleCategory));
  }, [groceryList, dueRecurringEntries, extraItems, aisleCategory]);

  // One shared crossed-out state for both tabs — Lijst's house icon and
  // Winkel's checkbox are just two views onto the same persisted `checked`
  // map, so there's only ever one true status per item, not two: crossing
  // something out in Lijst excludes it from Winkel, and checking it off in
  // Winkel (see toggleCheck below) crosses it out in Lijst right back.
  //
  // Defaults layer on top for anything with no explicit choice yet this
  // week: a "regular" (recipes_per_unit > isRegular's threshold — salt, soy
  // sauce, olive oil: something one purchase covers many recipes' worth of)
  // starts crossed out, on the assumption it's already in stock. A
  // "suggestie" (a longer-interval recurring item — pindakaas, wc papier...)
  // starts crossed out too, same reasoning: it's a guess about timing
  // rather than a certainty, so the cheap default is "assume not needed,
  // one tap to correct" rather than cluttering Winkel. Once tapped (either
  // tab, either direction), that's an explicit, persisted choice for this
  // week and the default no longer applies to it.
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

  // An already-known ingredient (typed exactly, or picked from the
  // suggestions dropdown) has nothing new to confirm — it goes straight into
  // Zelf toegevoegd like any other week item, skipping the "nieuw"/pending
  // step entirely. Only a name that doesn't match anything in Ingrediënten
  // beheer goes through addPendingItem below.
  const addConfirmedItem = async (name) => {
    try {
      const idMap = await resolveIngredientIds([name]);
      const id = idMap.get(name);
      ingredientIdsRef.current.set(name, id);
      await addGroceryOverride(dstr(weekStart), id);
      setExtraItems((prev) => ({ ...prev, [name]: true }));
    } catch { setSaveErr(true); }
  };

  // Lijst's "voeg item toe" bar drops a genuinely new item into
  // pendingExtraItems as an editable, unsaved "nieuw" row — nothing is
  // written to the backend until its checkmark is pressed
  // (confirmPendingItem), so a mistyped name or an add the user reconsiders
  // never touches the database.
  const addPendingItem = (rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const id = `pending-${pendingIdRef.current++}`;
    setPendingExtraItems((prev) => [...prev, { id, name, aisleCategory: null, availability: {} }]);
  };

  const updatePendingItem = (id, patch) => {
    setPendingExtraItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const setPendingName = (id, name) => updatePendingItem(id, { name });
  const setPendingAisle = (id, aisleCat) => updatePendingItem(id, { aisleCategory: aisleCat });
  const cyclePendingAvailability = (id, storeId, nextStatusVal) => {
    setPendingExtraItems((prev) => prev.map((item) => (
      item.id === id ? { ...item, availability: { ...item.availability, [storeId]: nextStatusVal } } : item
    )));
  };

  const cancelPendingItem = (id) => {
    setPendingExtraItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Only now — the checkmark on a pending row — does the item actually get
  // written: resolveIngredientIds finds the ingredient by exact name if it
  // already exists, or creates it (same find-or-create helper the recipe
  // form uses when saving a new ingredient name, so a never-seen name lands
  // in Ingrediënten beheer too, not just this week's list), any Schap/Winkels
  // set on the row are saved alongside it, and finally it's added to this
  // week's list.
  const confirmPendingItem = async (id) => {
    const pending = pendingExtraItems.find((item) => item.id === id);
    const name = pending?.name.trim();
    if (!name) return;
    try {
      const idMap = await resolveIngredientIds([name]);
      const ingredientId = idMap.get(name);
      ingredientIdsRef.current.set(name, ingredientId);
      if (pending.aisleCategory) await setIngredientAisleCategory(ingredientId, pending.aisleCategory);
      const availabilityEntries = Object.entries(pending.availability).filter(([, status]) => status);
      for (const [storeId, status] of availabilityEntries) {
        await setIngredientAvailability(ingredientId, storeId, status);
      }
      await addGroceryOverride(dstr(weekStart), ingredientId);
      setExtraItems((prev) => ({ ...prev, [name]: true }));
      setIngredientNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
      if (pending.aisleCategory) setAisleCategory((prev) => ({ ...prev, [name]: pending.aisleCategory }));
      if (availabilityEntries.length > 0) {
        setAvailability((prev) => ({ ...prev, [name]: { ...prev[name], ...pending.availability } }));
      }
      setPendingExtraItems((prev) => prev.filter((item) => item.id !== id));
    } catch { setSaveErr(true); }
  };

  const removeExtraItem = async (name) => {
    const id = ingredientIdsRef.current.get(name);
    setExtraItems((prev) => { const next = { ...prev }; delete next[name]; return next; });
    if (!id) return;
    try {
      await removeGroceryOverride(dstr(weekStart), id);
    } catch { setSaveErr(true); }
  };

  // Zelf toegevoegd's own rows — separate from groceryList/effectiveChecked
  // entirely (see the memos above), each carrying the Winkels/Schap info the
  // section displays alongside the delete cross.
  const extraItemEntries = useMemo(() =>
    Object.keys(extraItems)
      .sort((a, b) => a.localeCompare(b, "nl"))
      .map((name) => ({ name, availability: availability[name], aisleCategory: aisleCategory[name] })),
  [extraItems, availability, aisleCategory]);

  const addItemSuggestions = useMemo(() => {
    const q = addItemQuery.trim().toLowerCase();
    if (!q) return [];
    return ingredientNames
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, 6);
  }, [addItemQuery, ingredientNames]);

  const submitAddItem = () => {
    const trimmed = addItemQuery.trim();
    if (!trimmed) return;
    const existingName = ingredientNames.find((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (existingName) addConfirmedItem(existingName);
    else addPendingItem(trimmed);
    setAddItemQuery("");
    setAddItemSuggestOpen(false);
  };

  // What's left after crossing out — this, not fullGroceryList, is what
  // Winkel shows. A crossed-out item doesn't appear struck-through in
  // Winkel; it simply isn't there, since it's the same "don't need this"
  // status Lijst shows (see effectiveChecked above) — checking it off in
  // Winkel removes it from view here for the same reason crossing it out in
  // Lijst would. A Zelf toegevoegd item has no huisje to cross off, only
  // its own delete, so it always stays on the list until removed outright.
  const wishList = useMemo(() =>
    fullGroceryList.filter(([name]) => extraItems[name] || !effectiveChecked[name]),
  [fullGroceryList, effectiveChecked, extraItems]);

  // Wijst elk boodschappenlijst-item toe aan één winkel, afhankelijk van de
  // slider-stand. "bio": bio heeft voorrang boven winkelvolgorde (Lidl > AH >
  // Ekoplaza bio, en pas als nergens bio is de dichtstbijzijnde niet-bio optie).
  // "trips": winkelvolgorde heeft voorrang boven bio (eerste winkel die het
  // product sowieso heeft — bio of niet-bio — wordt gebruikt).
  const groceryByStore = useMemo(() => {
    const result = { lidl: [], ah: [], ekoplaza: [], other: [] };
    wishList.forEach(([name, qtys]) => {
      const { store, bio } = assignStore(availability[name], groceryMode);
      const item = { name, qtys, bio };
      (store ? result[store] : result.other).push(item);
    });
    return result;
  }, [wishList, availability, groceryMode]);

  // Shared by Winkel's own checkbox and Lijst's house icon (see
  // effectiveChecked above) — always flips the *effective* value (explicit
  // choice or default, whichever's currently showing), so tapping a
  // still-on-its-default item (e.g. a regular ingredient nobody's touched
  // yet this week) correctly turns it un-crossed rather than re-writing the
  // same default back. Which recurring items' countdown actually gets reset
  // from this happens once a week, in a scheduled backend job reading
  // grocery_checked — not from this tap — so a mis-tap-and-undo doesn't
  // skew an item's interval.
  const toggleCheck = (name) => {
    const wasChecked = !!effectiveChecked[name];
    const next = { ...checked, [name]: !wasChecked };
    persistChecked(next, weekKey);
  };

  // Shopping mode: a distraction-free, single-store view meant to sit next
  // to that store's own app in split-screen. The item list is a snapshot
  // taken here, at open time (groceryByStore is already checked-off items
  // excluded, via wishList/effectiveChecked above) — see ShoppingMode.jsx
  // for why it stays a fixed list from then on rather than live-filtering
  // as items get checked.
  const [shoppingStore, setShoppingStore] = useState(null);
  const [shoppingItems, setShoppingItems] = useState([]);
  const openShoppingMode = (storeId) => {
    setShoppingItems(storeId === "all" ? wishList.map(([name, qtys]) => ({ name, qtys })) : groceryByStore[storeId]);
    setShoppingStore(storeId);
  };

  // De unieke recepten die deze week daadwerkelijk gepland staan, voor de
  // weekbeoordeling. Op volgorde van eerste kookdag.
  const weekRecipes = useMemo(() => {
    const seen = new Map();
    contributingDays.forEach(({ recipeId }) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe && !seen.has(recipe.id)) seen.set(recipe.id, recipe);
    });
    sideContributingDays.forEach(({ sideRecipeId }) => {
      const side = recipes.find((r) => r.id === sideRecipeId);
      if (side && !seen.has(side.id)) seen.set(side.id, side);
    });
    return [...seen.values()];
  }, [contributingDays, sideContributingDays, recipes]);

  const addRecipe = async (draft) => {
    const clean = {
      name: draft.name.trim(),
      tag: draft.tag,
      course: draft.course === "side" ? "side" : "main",
      sideRecommended: draft.course !== "side" && !!draft.sideRecommended,
      suspended: !!draft.suspended,
      instructions: draft.instructions.trim(),
      prepMinutes: parseInt(draft.prepMinutes, 10) || null,
      // The form always deals in "voor 6 personen" amounts (the recipe's
      // familiar reference batch) — convert down to what's actually stored.
      ingredients: draft.ingredients.map(([n, q]) => [n.trim(), toPerPerson(q.trim())]).filter(([n]) => n.length > 0),
    };
    if (!clean.name || clean.name.length > RECIPE_NAME_MAX_LENGTH || clean.ingredients.length === 0 || !clean.prepMinutes) return false;
    try {
      const { data: inserted, error } = await supabase
        .from("recipes")
        .insert({ name: clean.name, tag: clean.tag, course: clean.course, side_recommended: clean.sideRecommended, suspended: clean.suspended, instructions: clean.instructions, prep_minutes: clean.prepMinutes })
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
      return true;
    } catch { setSaveErr(true); return false; }
  };

  const updateRecipe = async (id, draft) => {
    const clean = {
      name: draft.name.trim(),
      tag: draft.tag,
      course: draft.course === "side" ? "side" : "main",
      sideRecommended: draft.course !== "side" && !!draft.sideRecommended,
      suspended: !!draft.suspended,
      instructions: draft.instructions.trim(),
      prepMinutes: parseInt(draft.prepMinutes, 10) || null,
      // The form always deals in "voor 6 personen" amounts (the recipe's
      // familiar reference batch) — convert down to what's actually stored.
      ingredients: draft.ingredients.map(([n, q]) => [n.trim(), toPerPerson(q.trim())]).filter(([n]) => n.length > 0),
    };
    if (!clean.name || clean.name.length > RECIPE_NAME_MAX_LENGTH || clean.ingredients.length === 0 || !clean.prepMinutes) return false;
    try {
      const { error } = await supabase.from("recipes").update({ name: clean.name, tag: clean.tag, course: clean.course, side_recommended: clean.sideRecommended, instructions: clean.instructions, prep_minutes: clean.prepMinutes, suspended: clean.suspended }).eq("id", id);
      if (error) throw error;
      const idMap = await resolveIngredientIds(clean.ingredients.map(([n]) => n));
      idMap.forEach((idVal, name) => ingredientIdsRef.current.set(name, idVal));
      const { error: delErr } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
      if (delErr) throw delErr;
      const rows = clean.ingredients.map(([n, q], i) => ({ recipe_id: id, ingredient_id: idMap.get(n), quantity: q, sort_order: i }));
      const { error: riErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (riErr) throw riErr;
      setRecipes((prev) => prev.map((r) => (r.id === id ? { id, ...clean } : r)));
      setEditing(null);
      return true;
    } catch { setSaveErr(true); return false; }
  };

  // Shared by every entry point that opens the recipe edit form (Recepten
  // beheren's own pencil, and the day-grid's own).
  const handleSaveRecipe = (draft) => (draft.id ? updateRecipe(draft.id, draft) : addRecipe(draft));

  // The day-grid's own edit entry point — same draft shape RecipeManager's
  // pencil builds, opening straight into editing (the pencil sits far
  // enough from the day-grid's other controls now to not need an "are you
  // sure" confirm first).
  const startEditRecipe = (r) => {
    setEditing({ id: r.id, name: r.name, tag: r.tag, course: r.course ?? "main", sideRecommended: r.sideRecommended ?? false, suspended: r.suspended ?? false, instructions: r.instructions, prepMinutes: r.prepMinutes ? String(r.prepMinutes) : "", ingredients: r.ingredients.map(([n, q]) => [n, toReferenceSix(q)]) });
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

  // Swipe-to-navigate between weeks on the planner view, with the content
  // dragging under the finger so the gesture has visible feedback. This is
  // driven entirely off the DOM via refs rather than React state: touchmove
  // writes straight to the node's `transform` (a compositor-only property —
  // no layout/reflow, no React re-render per frame), coalesced to one write
  // per animation frame. The only React state update in the whole gesture is
  // the single setWeekStart at the end. `touchAction: "pan-y"` lets the
  // browser keep handling vertical scrolling on its own, so there's no need
  // to fight it with preventDefault (which React's passive touch listeners
  // don't honor anyway). Disabled while a modal/picker is open over the
  // planner so a swipe there can't change the week underneath.
  const swipeRef = useRef(null);
  const touchStartRef = useRef(null);
  const rafRef = useRef(null);

  const SWIPE_THRESHOLD = 60;

  const applyTransform = (px, withTransition) => {
    const el = swipeRef.current;
    if (!el) return;
    el.style.transition = withTransition ? "transform 200ms ease-out" : "none";
    el.style.transform = `translateX(${px}px)`;
  };

  const handleWeekSwipeStart = (e) => {
    if (addingDay || addingSideDay || reviewOpen || editing || pickedUpDay) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, dx: 0, dragging: false };
  };

  const handleWeekSwipeMove = (e) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.dragging) {
      // Not yet committed to a direction — wait for a clear enough move to
      // tell a horizontal swipe from a vertical scroll, then decide once.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { touchStartRef.current = null; return; }
      start.dragging = true;
    }
    start.dx = dx;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (touchStartRef.current?.dragging) applyTransform(touchStartRef.current.dx, false);
      });
    }
  };

  const finishSwipe = (dx) => {
    const el = swipeRef.current;
    if (!el) return;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      const dir = dx < 0 ? -1 : 1; // -1 = swiped left -> next week, 1 = swiped right -> previous week
      const width = el.offsetWidth || window.innerWidth;
      el.addEventListener("transitionend", function onDone() {
        el.removeEventListener("transitionend", onDone);
        applyTransform(-dir * width, false); // pre-position the new week off the opposite edge
        // Force the browser to commit that jump before scheduling the
        // animate-in — otherwise it can collapse the jump and the animation
        // into one style recalculation and interpolate from wherever it
        // last actually painted (still off-screen on the exit side), which
        // reads as the new week entering from the wrong edge. A second
        // rAF (not just one) is needed for this to be reliable on mobile
        // Safari.
        void el.offsetWidth;
        setWeekStart(addDays(weekStart, dir < 0 ? 7 : -7));
        requestAnimationFrame(() => requestAnimationFrame(() => applyTransform(0, true))); // then slide it into place
      }, { once: true });
      applyTransform(dir * width, true); // carry the old week the rest of the way off-screen
    } else {
      applyTransform(0, true); // short of the threshold — snap back
    }
  };

  const handleWeekSwipeEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (!start?.dragging) return;
    const t = e.changedTouches[0];
    finishSwipe(t.clientX - start.x);
  };

  const handleWeekSwipeCancel = () => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (start?.dragging) applyTransform(0, true);
  };

  // Long-press "pick up" a day's dish, then drag it onto another day to
  // swap the two, or onto the remove zone to drop it — only ever armed on
  // an independent day's own closed search-bar button (see the day-grid
  // below), never while locked. A touch's target stays fixed to wherever
  // it started for the rest of that touch's move/end events regardless of
  // where the finger physically travels, so these three handlers alone see
  // the whole gesture — no need to also touch the week-swipe handlers
  // above beyond bailing out early (see handleWeekSwipeStart) once a day's
  // actually been picked up.
  const LONG_PRESS_MS = 450;
  const LONG_PRESS_CANCEL_PX = 10;
  const longPressTimerRef = useRef(null);
  const pressStartRef = useRef(null); // { x, y, dayKey, armed }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };

  // Whatever's under the given viewport point right now — another day's
  // own row (data-day-key) or the remove zone (data-drop-remove) — read
  // live via elementFromPoint rather than tracked bounding boxes, so it
  // stays correct even if the page has scrolled mid-drag.
  const dropTargetAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const removeEl = el.closest("[data-drop-remove]");
    if (removeEl) return "remove";
    const dayEl = el.closest("[data-day-key]");
    return dayEl ? dayEl.getAttribute("data-day-key") : null;
  };

  // kind is "main" or "side" — same gesture either way (see
  // handleRecipePressEnd below for where they diverge, at the actual
  // swap/remove dispatch).
  const handleRecipePressStart = (e, dayKey, kind) => {
    const t = e.touches[0];
    pressStartRef.current = { x: t.clientX, y: t.clientY, dayKey, kind, armed: false };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (!pressStartRef.current || pressStartRef.current.dayKey !== dayKey || pressStartRef.current.kind !== kind) return;
      pressStartRef.current.armed = true;
      navigator.vibrate?.(15);
      setPickedUpDay(dayKey);
      setDragOverTarget(dayKey);
    }, LONG_PRESS_MS);
  };

  const handleRecipePressMove = (e) => {
    const press = pressStartRef.current;
    if (!press) return;
    const t = e.touches[0];
    if (!press.armed) {
      // Not lifted yet — a real scroll/swipe, not a hold. Let the week-swipe
      // gesture (or native scroll) keep handling this touch untouched.
      const dx = t.clientX - press.x;
      const dy = t.clientY - press.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) {
        clearLongPressTimer();
        pressStartRef.current = null;
      }
      return;
    }
    // Picked up — this gesture is ours now, not the week-swipe's.
    e.stopPropagation();
    setDragOverTarget(dropTargetAt(t.clientX, t.clientY));
  };

  const handleRecipePressEnd = (e) => {
    const press = pressStartRef.current;
    clearLongPressTimer();
    pressStartRef.current = null;
    if (!press?.armed) return;
    e.stopPropagation();
    const t = e.changedTouches[0];
    const target = dropTargetAt(t.clientX, t.clientY);
    setPickedUpDay(null);
    setDragOverTarget(null);
    if (press.kind === "side") {
      if (target === "remove") removeSide(press.dayKey);
      else if (target && target !== press.dayKey) swapSideDays(press.dayKey, target);
    } else {
      if (target === "remove") setCookDay(press.dayKey, null);
      else if (target && target !== press.dayKey) swapDays(press.dayKey, target);
    }
  };

  const handleRecipePressCancel = (e) => {
    const press = pressStartRef.current;
    clearLongPressTimer();
    pressStartRef.current = null;
    if (press?.armed) e.stopPropagation();
    setPickedUpDay(null);
    setDragOverTarget(null);
  };

  // React's own onTouchMove is always registered passive (for scroll
  // perf), so preventDefault() inside handleRecipePressMove above is
  // silently ignored — that's fine for isolating the drag from the
  // week-swipe gesture (stopPropagation still works there), but it can't
  // stop the browser's OWN native scrolling once a long-press arms.
  // Leaving touch-action alone (rather than disabling it up front) keeps
  // this big, central button scrolling normally for every ordinary touch —
  // this raw, non-passive listener is what actually suppresses native
  // scroll, and only for the remainder of a touch that's already armed.
  // Attached on the swipeable container (an ancestor of every day's
  // button) so one listener covers all of them; it fires before React's
  // own delegated dispatch reaches the button's handlers regardless of
  // which one stopPropagation()s later, since it sits closer to the touch
  // in the native bubble order.
  // A ref callback (with its React 19 cleanup return) rather than a
  // useEffect keyed to some particular state — the swipeable div actually
  // mounts/unmounts more than once (past the loading spinner, and again
  // around ShoppingMode's own early return below), and a callback fires
  // exactly when the node itself attaches/detaches regardless of why,
  // instead of needing every current and future condition that could
  // remount it listed in a dependency array.
  const attachSwipeRef = useCallback((el) => {
    swipeRef.current = el;
    if (!el) return;
    const onTouchMove = (e) => {
      if (pressStartRef.current?.armed) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      swipeRef.current = null;
    };
  }, []);

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
    <div style={{ minHeight: "100vh", background: "#EEEBE2", fontFamily: "'Manrope', system-ui, sans-serif", color: "#232823", paddingBottom: 48 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        .ledger-btn { transition: transform .15s ease; }
        .ledger-btn:hover { transform: translateY(-1px); }
        .ledger-btn:focus-visible, .day-card:focus-visible, .check-row:focus-visible, .link-btn:focus-visible { outline: 2px solid #5C7A5E; outline-offset: 2px; }
        button, input, select, textarea { font-family: 'Manrope', sans-serif; }
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
                fontFamily: "'Abril Fatface', serif", fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", color: "#232823",
              }}
            >
              <ShoppingCart size={32} color="#5C7A5E" style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>Regel Het Eten</span>
              <ChefHat size={32} color="#5C7A5E" style={{ flexShrink: 0 }} />
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

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px", overflowX: "hidden" }}>

        {view === "recipes" ? (
          <RecipeManager
            recipes={recipes}
            editing={editing}
            setEditing={setEditing}
            onRemove={removeRecipe}
            onClose={() => { setView("planner"); setEditing(null); }}
          />
        ) : view === "ingredients" ? (
          <IngredientManager onClose={() => { setView("planner"); refreshIngredientNames(); }} />
        ) : (
          <div
            ref={attachSwipeRef}
            onTouchStart={handleWeekSwipeStart}
            onTouchMove={handleWeekSwipeMove}
            onTouchEnd={handleWeekSwipeEnd}
            onTouchCancel={handleWeekSwipeCancel}
            style={{ touchAction: "pan-y" }}
          >
            {/* Weeknavigatie */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <button className="ledger-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtnStyle} aria-label="Vorige week">
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Abril Fatface', serif", fontWeight: 600, fontSize: 17 }}>
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
            {!locked && usableRecipes.length === 0 && (
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
                const dayKey = dstr(d);
                const prevKey = i > 0 ? dstr(weekDates[i - 1]) : null;
                const ownRecipeId = history[dayKey];
                // A day inherits its meal from the day before only when it
                // has no own pick yet AND that previous day is marked a
                // "2-daagse variant" — the only remaining way one day's
                // plan carries into another's, now that every day plans
                // independently by default.
                const inherited = ownRecipeId === undefined && !!prevKey && !!twoDayDays[prevKey] && history[prevKey] !== undefined;
                const anchorKey = inherited ? prevKey : dayKey;
                const effectiveRecipeId = inherited ? history[prevKey] : ownRecipeId;
                const recipe = recipes.find((r) => r.id === effectiveRecipeId);
                const independent = !inherited;
                const isTwoDay = !!twoDayDays[dayKey];
                // Only an independent day with its own dish (not the week's
                // last day, which has no next day to hand off to) can become
                // a 2-daagse variant — see the toggle in the collapsed row
                // below. An inherited ("Tweede dag") day never gets one of
                // its own: it's already borrowing its dish from the day
                // before, which is the only place that choice lives.
                const showTwoDayToggle = independent && i < 6 && !!recipe;
                // Inherited falls back to the previous day's own default
                // (two evenings, shared); an independent day falls back to
                // its own, doubled only when it's itself a 2-daagse variant.
                const persons = dayPersons[dayKey] ?? dayPersons[anchorKey] ?? defaultPersonsForSpan(twoDayDays[anchorKey]);
                // Unlike its main, a day's side is always just its own pick
                // — never inherited from its cook day, even when the main
                // itself is shared/inherited — see sideContributingDays.
                const sideRecipe = sideHistory[dayKey] && recipes.find((r) => r.id === sideHistory[dayKey]);
                // A side is portioned per evening by default — unlike the
                // main, it never shares a batch across two days, so there's
                // no anchor to fall back to here.
                const sidePersonsValue = sidePersons[dayKey] ?? EVENING_PERSONS;
                const TagIcon = recipe && (TAG_ICONS[recipe.tag] || Carrot);
                const isToday = dstr(d) === dstr(new Date());
                const expanded = expandedDay === dayKey;
                // Picked up (see handleRecipePressStart) dims this row in
                // place; a different day currently under the finger during
                // that drag gets a "drop here to swap" highlight instead —
                // never both on the same row, so the source doesn't fight
                // its own highlight the moment it's lifted.
                const isPickedUp = pickedUpDay === dayKey;
                const isDropTarget = !!pickedUpDay && pickedUpDay !== dayKey && dragOverTarget === dayKey;
                return (
                  <div
                    key={dayKey}
                    data-day-key={dayKey}
                    style={{
                      borderBottom: "1px solid #C9C2AE",
                      background: isDropTarget ? "rgba(92,122,94,0.18)" : isToday ? "rgba(92,122,94,0.07)" : "transparent",
                      opacity: isPickedUp ? 0.5 : 1,
                      outline: isDropTarget ? "2px solid #5C7A5E" : "none",
                      outlineOffset: -2,
                      transition: "background 120ms ease, opacity 120ms ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: showTwoDayToggle ? "stretch" : "center", gap: 14, padding: "13px 4px" }}>
                      {/* Date/dice sit at the top of this column; when this
                          day can show the 2-daagse-variant toggle (below),
                          justify-content pins that toggle to the very
                          bottom of the row instead of the middle — the row
                          above stretches to match the taller recipe/side
                          column next to it precisely so this has somewhere
                          to sit. Otherwise this column is just its own
                          intrinsic height, same as before. */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {/* Date and its randomize button are one tight group (gap 16)
                            rather than sharing the row's wider gap (14) — keeps the
                            button close to the date it belongs to instead of stranding
                            it in the middle of the row. Was 3 (plus the button's own
                            padding, its own equal contributor to the visible gap) —
                            bumped back up ~13px (~2mm) after the last pass tightened
                            both a little further than wanted. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          {/* 44px was wildly oversized for this box's actual content — a
                              two-digit date at this font size only ever measures ~16px,
                              so most of what looked like "gap" was really dead space
                              reserved inside this box, not the flex gap next to it. Still
                              a fixed width (so 1-digit and 2-digit dates in the same week
                              don't shift the columns after them), but right-aligned so
                              that fixed width no longer matters for the gap either way —
                              a narrow "1" would otherwise leave more trailing space than
                              a wide "29" and make the gap look inconsistent day to day. */}
                          <div style={{ width: 22, flexShrink: 0, textAlign: "right" }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#6E6A59" }}>{DAY_NAMES[i]}</div>
                            <div style={{ fontFamily: "'Abril Fatface', serif", fontWeight: 600, fontSize: 16 }}>{d.getDate()}</div>
                          </div>
                          {/* Fixed-width slot so the recipe column always starts at the
                              same x — present on every row regardless of whether this
                              particular day currently shows the button, so a restjesdag
                              (no button) lines up with its cook day (button) instead of
                              the recipe name shifting left/right row to row. */}
                          <div style={{ width: 21, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                            {/* Available on an empty day (assigns a fresh
                                pick directly) and on an inherited "Tweede
                                dag" too — rerolling one just picks its own
                                dish, diverging it from the day before
                                (which also turns off that day's own
                                2-daagse flag, via setCookDay's own
                                divergence cleanup) rather than being stuck
                                reusing whatever the day before happens to
                                have. */}
                            {!locked && (
                              <button
                                onClick={() => randomizeDay(dayKey)}
                                aria-label={`Willekeurige maaltijd voor ${DAY_NAMES[i]}`}
                                title="Willekeurige maaltijd voor deze dag"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 3, margin: "-3px", display: "flex" }}
                              >
                                <RefreshCw size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Quick-access 2-daagse-variant toggle, reachable
                            straight from the closed row instead of only
                            from the expanded detail view (which still has
                            its own, more explicit copy of this same
                            button). Centered under the date/dice group
                            above and pinned to the row's bottom via the
                            column's justify-content: space-between. */}
                        {showTwoDayToggle && (
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <button
                              onClick={() => toggleTwoDay(dayKey)}
                              disabled={locked}
                              aria-pressed={isTwoDay}
                              aria-label={isTwoDay ? `${DAY_NAMES[i]} is een 2-daagse variant — uitzetten` : `Maak van ${DAY_NAMES[i]} een 2-daagse variant`}
                              title={isTwoDay ? "2-daagse variant" : "Maak 2-daagse variant"}
                              style={{
                                background: "none", border: "none", padding: 3, margin: "-3px", display: "flex",
                                cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.4 : 1,
                                color: isTwoDay ? "#5C7A5E" : "#6E6A59",
                              }}
                            >
                              <ArrowDown size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {recipe ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <TagIcon size={18} color={tagColor(recipe.tag)} strokeWidth={2.25} style={{ flexShrink: 0 }} />
                              {!locked ? (
                                inlineSearchDay === dayKey ? (
                                  // Tapped open: a real, focused input right here in the
                                  // day-grid (not the full-screen picker yet) — shows the
                                  // current recipe as a one-row suggestion below it until
                                  // typing actually starts.
                                  <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                                    <input
                                      autoFocus
                                      value={inlineQuery}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInlineQuery(val);
                                        if (val) {
                                          // Typing started — hand off to the full-screen
                                          // picker, carrying the typed text over as its
                                          // starting query instead of restarting the search.
                                          setSwappingRecipe(recipe);
                                          setPendingQuery(val);
                                          setAddingDay(dayKey);
                                          setInlineSearchDay(null);
                                        }
                                      }}
                                      onBlur={() => setInlineSearchDay(null)}
                                      onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                                      placeholder={recipe.name}
                                      aria-label={`Andere maaltijd zoeken voor ${DAY_NAMES[i]}`}
                                      style={{ ...inputStyle, marginTop: 0, padding: "7px 30px 7px 10px", fontSize: 14.5 }}
                                    />
                                    <Search size={14} color="#6E6A59" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                    {!inlineQuery && (
                                      <div
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => setInlineSearchDay(null)}
                                        style={{
                                          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                                          background: "#fff", border: "1px solid #C9C2AE", borderRadius: 8,
                                          boxShadow: "0 4px 12px rgba(35,40,35,0.15)", padding: "10px 12px",
                                          fontSize: 14, cursor: "pointer",
                                        }}
                                      >
                                        {recipe.name}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Closed: looks like a real search bar (white, rounded,
                                  // magnifying glass) rather than plain text, so it's clear
                                  // up front that tapping it searches for a different meal.
                                  // A plain tap still opens that search as usual; holding it
                                  // down instead arms the pick-up-and-drag gesture (see
                                  // handleRecipePressStart above) — independent days only,
                                  // there's no "own" dish to pick up off a borrowed Tweede
                                  // dag.
                                  <button
                                    onClick={() => { setInlineSearchDay(dayKey); setInlineQuery(""); }}
                                    onTouchStart={independent ? (e) => handleRecipePressStart(e, dayKey, "main") : undefined}
                                    onTouchMove={independent ? handleRecipePressMove : undefined}
                                    onTouchEnd={independent ? handleRecipePressEnd : undefined}
                                    onTouchCancel={independent ? handleRecipePressCancel : undefined}
                                    aria-label={`${recipe.name} — andere maaltijd zoeken`}
                                    style={{
                                      ...inputStyle, marginTop: 0, flex: 1, minWidth: 0, cursor: "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                                      fontSize: 14.5, fontWeight: 500, color: "#232823", textAlign: "left",
                                      // The browser's own long-press-to-select-text (and, on
                                      // iOS, its copy/share callout) competes with the pick-up
                                      // gesture on this same hold — suppressed here so holding
                                      // the name only ever arms the drag, never selects it.
                                      ...(independent ? { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } : null),
                                    }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipe.name}</span>
                                    <Search size={14} color="#6E6A59" style={{ flexShrink: 0 }} />
                                  </button>
                                )
                              ) : (
                                <button
                                  onClick={() => setExpandedDay(expanded ? null : dayKey)}
                                  className="day-card"
                                  style={{ background: "none", border: "none", padding: 0, fontSize: 14.5, fontWeight: 500, cursor: "pointer", textAlign: "left", color: "#232823" }}
                                >
                                  {recipe.name}
                                </button>
                              )}
                              {recipe && (
                                // A plain tweede dag needs the book too — its
                                // own side is independent of the (shared,
                                // still-hidden-below) main, and this is the
                                // only way to reach it. Book and remove sit
                                // inline right next to the name/search bar,
                                // book first then remove, rather than
                                // stacked into their own column.
                                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                  {/* Same solid-fill/white-icon treatment as
                                      the vergrendel button's own on/off
                                      states below, rather than a faint tint
                                      — open needs to read as clearly
                                      "pressed" at a glance, not just a
                                      slightly different shade. The closed
                                      glyph also goes bolder (full ink,
                                      thicker stroke) so its shape reads
                                      clearly as a shut book rather than a
                                      generic light-grey icon. */}
                                  <button
                                    onClick={() => setExpandedDay(expanded ? null : dayKey)}
                                    aria-expanded={expanded}
                                    aria-label={expanded ? "Ingrediënten en bereidingswijze verbergen" : "Ingrediënten en bereidingswijze tonen"}
                                    title={expanded ? "Sluiten" : "Ingrediënten en bereidingswijze tonen"}
                                    style={{
                                      background: expanded ? "#5C7A5E" : "none", border: "none", cursor: "pointer",
                                      color: expanded ? "#fff" : "#232823", padding: 6, borderRadius: 8, display: "flex",
                                    }}
                                  >
                                    {expanded ? <BookOpen size={20} strokeWidth={2.25} /> : <Book size={20} strokeWidth={2.25} />}
                                  </button>
                                  {!locked && (
                                    // An independent day removes its own
                                    // dish outright; an inherited "Tweede
                                    // dag" has no dish of its own to
                                    // remove — this instead turns off the
                                    // day before's 2-daagse flag, the only
                                    // thing actually making this day show
                                    // that dish, so it goes back to empty.
                                    <button
                                      onClick={() => (independent ? setCookDay(dayKey, null) : toggleTwoDay(anchorKey))}
                                      aria-label={independent ? "Maaltijd verwijderen" : "Tweede dag verwijderen"}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", opacity: 0.6, padding: 6, display: "flex" }}
                                    >
                                      <X size={15} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            {independent ? (
                              recipe.prepMinutes && (
                                <div style={{ marginLeft: 14, fontSize: 11, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {recipe.prepMinutes} min
                                </div>
                              )
                            ) : (
                              <div style={{ marginLeft: 14, fontSize: 11, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace" }}>
                                Tweede dag
                              </div>
                            )}
                            {/* Bijgerecht — its own reroll (never touched by
                                the main's dice above), independent of the
                                main per-day, even on a plain tweede dag
                                sharing its cook day's main: a two-day
                                casserole almost always wants a different
                                side each evening, so this is available on
                                every day with a meal (own or inherited)
                                regardless of side_recommended, letting any
                                main get one on request. The name itself is a
                                search bar too, same as the main's own —
                                tapping it opens an inline search that hands
                                off to the full-screen picker once you type,
                                for finding a *specific* side rather than
                                only ever rolling a random one. */}
                            {recipe && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 14, marginTop: 4 }}>
                                {!locked && (
                                  <button
                                    onClick={() => randomizeSide(dayKey)}
                                    aria-label={sideRecipe ? `Ander bijgerecht voor ${DAY_NAMES[i]}` : `Bijgerecht toevoegen voor ${DAY_NAMES[i]}`}
                                    title="Willekeurig bijgerecht"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#8B5FA6", padding: 3, margin: "-3px", display: "flex", flexShrink: 0 }}
                                  >
                                    <RefreshCw size={13} />
                                  </button>
                                )}
                                {sideRecipe ? (
                                  !locked ? (
                                    sideInlineSearchDay === dayKey ? (
                                      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                                        <input
                                          autoFocus
                                          value={sideInlineQuery}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setSideInlineQuery(val);
                                            if (val) {
                                              setSwappingSide(sideRecipe);
                                              setPendingSideQuery(val);
                                              setAddingSideDay(dayKey);
                                              setSideInlineSearchDay(null);
                                            }
                                          }}
                                          onBlur={() => setSideInlineSearchDay(null)}
                                          onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                                          placeholder={sideRecipe.name}
                                          aria-label={`Ander bijgerecht zoeken voor ${DAY_NAMES[i]}`}
                                          style={{ ...inputStyle, marginTop: 0, padding: "5px 26px 5px 8px", fontSize: 13 }}
                                        />
                                        <Search size={12} color="#6E6A59" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                        {!sideInlineQuery && (
                                          <div
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => setSideInlineSearchDay(null)}
                                            style={{
                                              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                                              background: "#fff", border: "1px solid #C9C2AE", borderRadius: 8,
                                              boxShadow: "0 4px 12px rgba(35,40,35,0.15)", padding: "8px 10px",
                                              fontSize: 13, cursor: "pointer",
                                            }}
                                          >
                                            {sideRecipe.name}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      // Same pick-up-and-drag as the main's own closed
                                      // button above (see handleRecipePressStart) — hold to
                                      // arm, drag onto another day's side to swap, or onto
                                      // the remove zone to drop it. Available on every day
                                      // that currently has a side of its own, independent
                                      // of whether that day's main itself is independent or
                                      // inherited.
                                      <button
                                        onClick={() => { setSideInlineSearchDay(dayKey); setSideInlineQuery(""); }}
                                        onTouchStart={(e) => handleRecipePressStart(e, dayKey, "side")}
                                        onTouchMove={handleRecipePressMove}
                                        onTouchEnd={handleRecipePressEnd}
                                        onTouchCancel={handleRecipePressCancel}
                                        aria-label={`${sideRecipe.name} — ander bijgerecht zoeken`}
                                        style={{
                                          ...inputStyle, marginTop: 0, flex: 1, minWidth: 0, cursor: "pointer",
                                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                                          fontSize: 13, fontWeight: 500, color: "#232823", textAlign: "left", padding: "5px 8px",
                                          WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none",
                                        }}
                                      >
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sideRecipe.name}</span>
                                        <Search size={12} color="#6E6A59" style={{ flexShrink: 0 }} />
                                      </button>
                                    )
                                  ) : (
                                    // Locked reads as a plain sentence rather
                                    // than a row of independent controls —
                                    // "met" spells out that this is the main's
                                    // side, not a second dish of its own.
                                    <span style={{ fontSize: 13, color: "#4A4E42" }}>met {sideRecipe.name}</span>
                                  )
                                ) : (
                                  !locked && (
                                    <button
                                      onClick={() => { setAddingSideDay(dayKey); setSwappingSide(null); setPendingSideQuery(""); }}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#6E6A59", fontSize: 12.5, padding: 0, display: "flex", alignItems: "center", gap: 4 }}
                                    >
                                      <Plus size={12} /> Bijgerecht toevoegen
                                    </button>
                                  )
                                )}
                                {sideRecipe && !locked && (
                                  <button
                                    onClick={() => removeSide(dayKey)}
                                    aria-label={`${sideRecipe.name} (bijgerecht) verwijderen`}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#A75135", opacity: 0.6, padding: 2, display: "flex", flexShrink: 0 }}
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                            {sideRecipe && sideRecipe.prepMinutes && (
                              <div style={{ marginLeft: 14, marginTop: 2, fontSize: 11, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace" }}>
                                {sideRecipe.prepMinutes} min
                              </div>
                            )}
                          </div>
                        ) : !locked ? (
                          <button onClick={() => { setAddingDay(dayKey); setSwappingRecipe(null); setPendingQuery(""); }} className="day-card" style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: "#6E6A59", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            <Plus size={14} /> Maaltijd toevoegen
                          </button>
                        ) : (
                          <span style={{ fontSize: 13.5, color: "#6E6A59", fontStyle: "italic" }}>nog geen kookdag gepland</span>
                        )}
                      </div>
                    </div>
                    {expanded && recipe && (
                      <div style={{ padding: "0 4px 16px 58px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#5C7A5E" }}>
                            Hoofdgerecht: {recipe.name}
                          </span>
                          {/* Editing the recipe itself is a different action
                              from changing this week's plan, so it stays
                              available even while the week is locked. */}
                          <button
                            onClick={() => startEditRecipe(recipe)}
                            aria-label={`${recipe.name} bewerken`}
                            title="Recept bewerken"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#5C7A5E", padding: 2, display: "flex", flexShrink: 0 }}
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11.5, color: "#6E6A59" }}>Aantal personen</span>
                          <button
                            onClick={() => setDayPersonsValue(independent ? dayKey : anchorKey, persons - 1)}
                            disabled={locked || persons <= 1}
                            aria-label="Minder personen"
                            style={{
                              width: 22, height: 22, borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff",
                              color: "#5C7A5E", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                              cursor: locked || persons <= 1 ? "not-allowed" : "pointer", opacity: locked || persons <= 1 ? 0.4 : 1,
                            }}
                          >
                            <Minus size={12} />
                          </button>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, minWidth: 16, textAlign: "center" }}>{persons}</span>
                          <button
                            onClick={() => setDayPersonsValue(independent ? dayKey : anchorKey, persons + 1)}
                            disabled={locked}
                            aria-label="Meer personen"
                            style={{
                              width: 22, height: 22, borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff",
                              color: "#5C7A5E", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                              cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.4 : 1,
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace", marginBottom: recipe.instructions ? 8 : 0 }}>
                          {recipe.ingredients.map(([n, q]) => `${n} ${scaleQuantityForShopping(q, persons)}`).join(" · ")}
                        </div>
                        {recipe.instructions && (
                          <div style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.55 }}>
                            {recipe.instructions}
                          </div>
                        )}
                        {sideRecipe && (
                          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #C9C2AE" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#8B5FA6" }}>
                                Bijgerecht: {sideRecipe.name}
                              </span>
                              <button
                                onClick={() => startEditRecipe(sideRecipe)}
                                aria-label={`${sideRecipe.name} bewerken`}
                                title="Bijgerecht bewerken"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#8B5FA6", padding: 2, display: "flex", flexShrink: 0 }}
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 11.5, color: "#6E6A59" }}>Aantal personen</span>
                              <button
                                onClick={() => setSidePersonsValue(dayKey, sidePersonsValue - 1)}
                                disabled={locked || sidePersonsValue <= 1}
                                aria-label="Minder personen (bijgerecht)"
                                style={{
                                  width: 22, height: 22, borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff",
                                  color: "#8B5FA6", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                                  cursor: locked || sidePersonsValue <= 1 ? "not-allowed" : "pointer", opacity: locked || sidePersonsValue <= 1 ? 0.4 : 1,
                                }}
                              >
                                <Minus size={12} />
                              </button>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, minWidth: 16, textAlign: "center" }}>{sidePersonsValue}</span>
                              <button
                                onClick={() => setSidePersonsValue(dayKey, sidePersonsValue + 1)}
                                disabled={locked}
                                aria-label="Meer personen (bijgerecht)"
                                style={{
                                  width: 22, height: 22, borderRadius: 6, border: "1px solid #C9C2AE", background: "#fff",
                                  color: "#8B5FA6", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                                  cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.4 : 1,
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <div style={{ fontSize: 12.5, color: "#6E6A59", fontFamily: "'JetBrains Mono', monospace", marginBottom: sideRecipe.instructions ? 8 : 0 }}>
                              {sideRecipe.ingredients.map(([n, q]) => `${n} ${scaleQuantityForShopping(q, sidePersonsValue)}`).join(" · ")}
                            </div>
                            {sideRecipe.instructions && (
                              <div style={{ fontSize: 13.5, color: "#4A4E42", lineHeight: 1.55 }}>
                                {sideRecipe.instructions}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {/* Lijst: recepten, vaste boodschappen en suggesties naast elkaar */}
            {planTab === "lijst" && (
            <div style={{ marginTop: 18 }}>
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                    <input
                      value={addItemQuery}
                      onChange={(e) => { setAddItemQuery(e.target.value); setAddItemSuggestOpen(true); }}
                      onFocus={() => setAddItemSuggestOpen(true)}
                      onBlur={() => setTimeout(() => setAddItemSuggestOpen(false), 120)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAddItem(); } }}
                      placeholder="Item toevoegen aan lijst van deze week…"
                      aria-label="Item toevoegen aan lijst van deze week"
                      style={{ ...inputStyle, marginTop: 0, height: ADD_BTN_SIZE, boxSizing: "border-box", padding: "0 30px 0 10px", width: "100%" }}
                    />
                    <Search size={14} color="#6E6A59" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                    {addItemSuggestOpen && addItemSuggestions.length > 0 && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                        background: "#fff", border: "1px solid #C9C2AE", borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(35,40,35,0.15)", overflow: "hidden",
                      }}>
                        {addItemSuggestions.map((name) => (
                          <div
                            key={name}
                            onMouseDown={(e) => { e.preventDefault(); setAddItemQuery(name); setAddItemSuggestOpen(false); }}
                            style={{ padding: "9px 12px", fontSize: 14, cursor: "pointer" }}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={submitAddItem}
                    disabled={!addItemQuery.trim()}
                    aria-label="Item toevoegen"
                    style={{
                      width: ADD_BTN_SIZE, height: ADD_BTN_SIZE, flexShrink: 0, borderRadius: 10, border: "1px solid #5C7A5E",
                      background: "#5C7A5E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: addItemQuery.trim() ? "pointer" : "not-allowed", opacity: addItemQuery.trim() ? 1 : 0.5,
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <ExtraItemsSection
                  items={extraItemEntries}
                  onDelete={removeExtraItem}
                  pendingItems={pendingExtraItems}
                  onPendingNameChange={setPendingName}
                  onPendingAisleChange={setPendingAisle}
                  onPendingAvailabilityCycle={cyclePendingAvailability}
                  onPendingConfirm={confirmPendingItem}
                  onPendingCancel={cancelPendingItem}
                  confirmBtnSize={ADD_BTN_SIZE}
                />
              </div>

              {groceryList.length === 0 && sureThingsList.length === 0 && suggestionsList.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6E6A59", margin: 0 }}>
                  Plan bij Gerechten kookdagen om deze lijst te vullen.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: "#6E6A59", margin: "0 0 10px" }}>
                    Tik het huisje aan voor spullen die je al in huis hebt — de rest verschijnt in Winkel.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    <ListColumn title="Ingrediënten" items={groceryList} checked={effectiveChecked} onToggle={toggleCheck} />
                    <ListColumn title="Gebruikelijk" items={sureThingsList} checked={effectiveChecked} onToggle={toggleCheck} />
                    <ListColumn title="Suggesties" items={suggestionsList} checked={effectiveChecked} onToggle={toggleCheck} />
                  </div>
                </>
              )}
            </div>
            )}

            {/* Winkel (boodschappenlijst) — alleen wat in Lijst niet is uitgevinkt */}
            {planTab === "winkel" && (
            <div style={{ marginTop: 18 }}>
              {wishList.length === 0 && (
                <p style={{ fontSize: 13, color: "#6E6A59", margin: "0 0 14px" }}>
                  {fullGroceryList.length === 0
                    ? "Plan bij Gerechten kookdagen om deze lijst te vullen."
                    : "Alles is uitgevinkt bij Lijst — niets te doen deze week."}
                </p>
              )}
              {wishList.length > 0 && (
                <>
                  <GroceryModeSlider mode={groceryMode} setMode={setGroceryMode} />
                  {groceryMode === "all" ? (
                    <CompleteList items={wishList.map(([name, qtys]) => ({ name, qtys }))} checked={checked} onToggle={toggleCheck} onShop={() => openShoppingMode("all")} />
                  ) : (
                    <>
                      {STORE_DISPLAY_ORDER.map((id) => groceryByStore[id].length > 0 && (
                        <StoreSection key={id} storeId={id} items={groceryByStore[id]} checked={checked} onToggle={toggleCheck} onShop={openShoppingMode} />
                      ))}
                      {groceryByStore.other.length > 0 && (
                        <StoreSection storeId="other" items={groceryByStore.other} checked={checked} onToggle={toggleCheck} />
                      )}
                    </>
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
          </div>
        )}
      </div>

      {/* Remove zone for the pick-up-and-drag gesture (see
          handleRecipePressStart) — appears only once a day's actually
          picked up, fixed near the top of the viewport so it's reachable
          without scrolling regardless of which day's being dragged.
          data-drop-remove is what dropTargetAt looks for. Same "outside
          the swipeable div" placement as WeekReview/MealPicker below, for
          the same reason (position: fixed pins to a transformed ancestor
          otherwise). */}
      {pickedUpDay && (
        <div
          data-drop-remove="true"
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            padding: "18px 20px", boxSizing: "border-box",
            fontSize: 15, fontWeight: 700,
            // Deliberately NOT pointer-events:none — elementFromPoint (used
            // by dropTargetAt to detect a drop here) skips elements that
            // aren't hit-testable, and the touch itself stays targeted at
            // wherever the drag started regardless, so this never actually
            // intercepts a tap of its own.
            borderBottom: dragOverTarget === "remove" ? "3px solid #7A3623" : "3px solid transparent",
            background: dragOverTarget === "remove" ? "#A75135" : "#232823",
            color: "#fff", boxShadow: "0 6px 18px rgba(35,40,35,0.35)",
            transition: "background 120ms ease",
          }}
        >
          <Trash2 size={22} /> Sleep hierheen om te verwijderen
        </div>
      )}

      {/* WeekReview and MealPicker render as fixed-position overlays, so
          (like the edit form below) they need to sit outside the swipeable
          day-grid div above: a `position: fixed` descendant is pinned to
          whichever ancestor has a `transform` set, and the swipe gesture
          leaves one on that div (translateX(0px) once it settles) — nested
          inside it, these would end up positioned/clipped against the
          swiped content instead of the viewport. */}
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

      {/* Shared by both a main search (addingDay) and a side search
          (addingSideDay) — the two are mutually exclusive (only one search
          flow is ever active at a time), so one MealPicker instance covers
          both, switching its recipe pool/handlers by whichever is set. */}
      {(addingDay || addingSideDay) && (
        <MealPicker
          recipes={addingDay ? mainSearchableRecipes : sideSearchableRecipes}
          currentRecipe={addingDay ? swappingRecipe : swappingSide}
          initialQuery={addingDay ? pendingQuery : pendingSideQuery}
          onSelect={(id) => (addingDay ? setCookDay(addingDay, id) : selectSideFromPicker(addingSideDay, id))}
          onCancel={() => {
            setAddingDay(null); setSwappingRecipe(null); setPendingQuery("");
            setAddingSideDay(null); setSwappingSide(null); setPendingSideQuery("");
          }}
        />
      )}

      {/* Recipe edit/add form — shared by Recepten beheren's own "Nieuw
          recept"/pencil buttons and the day-grid's pencil below, so it needs
          to render regardless of which `view` is currently showing. */}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <RecipeForm draft={editing} setDraft={setEditing} onSave={handleSaveRecipe} onCancel={() => setEditing(null)} ingredientNames={ingredientNames} />
        </Modal>
      )}
    </div>
  );
}
