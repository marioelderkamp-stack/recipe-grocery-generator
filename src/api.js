// Supabase read/write helpers shared across the app.

import { supabase } from "./supabaseClient";

export async function fetchRecipesFromDb() {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,name,tag,instructions,prep_minutes,suspended,created_at,recipe_ingredients(quantity,sort_order,ingredients(name))")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    tag: r.tag,
    instructions: r.instructions,
    prepMinutes: r.prep_minutes,
    suspended: r.suspended,
    ingredients: [...r.recipe_ingredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ri) => [ri.ingredients.name, ri.quantity]),
  }));
}

// Finds or creates ingredient rows for the given names, returning a name -> id map.
export async function resolveIngredientIds(names) {
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) return new Map();
  const { data: existing, error: selErr } = await supabase.from("ingredients").select("id,name").in("name", uniqueNames);
  if (selErr) throw selErr;
  const map = new Map(existing.map((i) => [i.name, i.id]));
  const missing = uniqueNames.filter((n) => !map.has(n));
  if (missing.length > 0) {
    const { data: inserted, error: insErr } = await supabase.from("ingredients").insert(missing.map((name) => ({ name }))).select("id,name");
    if (insErr) throw insErr;
    inserted.forEach((i) => map.set(i.name, i.id));
  }
  return map;
}

export async function fetchIngredientsData() {
  const [ingRows, riRows, availRows, recurringRows] = await Promise.all([
    supabase.from("ingredients").select("id,name,recipes_per_unit,aisle_category").order("name", { ascending: true }),
    supabase.from("recipe_ingredients").select("ingredient_id"),
    supabase.from("ingredient_availability").select("ingredient_id,supermarket_id,status"),
    supabase.from("recurring_items").select("ingredient_id,interval_weeks"),
  ]);
  if (ingRows.error) throw ingRows.error;
  if (riRows.error) throw riRows.error;
  if (availRows.error) throw availRows.error;

  const usageCounts = {};
  riRows.data.forEach((row) => { usageCounts[row.ingredient_id] = (usageCounts[row.ingredient_id] || 0) + 1; });

  const availability = {};
  availRows.data.forEach((row) => {
    if (!availability[row.ingredient_id]) availability[row.ingredient_id] = {};
    availability[row.ingredient_id][row.supermarket_id] = row.status;
  });

  const recurringWeeks = {};
  if (!recurringRows.error) {
    recurringRows.data.forEach((row) => { recurringWeeks[row.ingredient_id] = row.interval_weeks; });
  }
  const ingredients = ingRows.data.map((i) => ({ ...i, recurring_interval_weeks: recurringWeeks[i.id] ?? null }));

  return { ingredients, usageCounts, availability };
}

export async function createIngredient(name) {
  const { data, error } = await supabase.from("ingredients").insert({ name }).select("id,name").single();
  if (error) throw error;
  return data;
}

// Renames an ingredient. If the new name collides with an existing ingredient
// (unique constraint), returns { collision: true } instead of throwing, so the
// caller can offer a merge; any other error is rethrown.
export async function renameIngredient(id, newName) {
  const { error } = await supabase.from("ingredients").update({ name: newName }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { collision: true };
    throw error;
  }
  return { collision: false };
}

// Repoints every reference from one ingredient onto another, then deletes the
// old row. ingredient_availability rows for the old ingredient cascade-delete
// automatically (ON DELETE CASCADE), so they don't need handling here.
export async function mergeIngredient(fromId, intoId) {
  const { error: riErr } = await supabase.from("recipe_ingredients").update({ ingredient_id: intoId }).eq("ingredient_id", fromId);
  if (riErr) throw riErr;
  const { error: gcErr } = await supabase.from("grocery_checked").update({ ingredient_id: intoId }).eq("ingredient_id", fromId);
  if (gcErr) throw gcErr;

  // recurring_items has one row per ingredient (PK on ingredient_id) — only
  // repoint fromId's row if intoId isn't already tracked, otherwise intoId's
  // row wins and fromId's is dropped by the cascade-delete below.
  const { data: intoRecurring, error: intoRecurringErr } = await supabase.from("recurring_items").select("ingredient_id").eq("ingredient_id", intoId).maybeSingle();
  if (intoRecurringErr) throw intoRecurringErr;
  if (!intoRecurring) {
    const { error: recurringErr } = await supabase.from("recurring_items").update({ ingredient_id: intoId }).eq("ingredient_id", fromId);
    if (recurringErr) throw recurringErr;
  }

  const { error: delErr } = await supabase.from("ingredients").delete().eq("id", fromId);
  if (delErr) throw delErr;
}

// Only safe to call when the ingredient has zero recipe_ingredients rows —
// the DB itself enforces this (ON DELETE RESTRICT), so callers should check
// the usage count first and hide/disable the action rather than rely on this
// throwing.
export async function deleteIngredient(id) {
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) throw error;
}

// Keeps a recipe out of the automatic weekly generator until it's edited
// again (updateRecipe clears this flag on every save).
export async function suspendRecipe(id) {
  const { error } = await supabase.from("recipes").update({ suspended: true }).eq("id", id);
  if (error) throw error;
}

export async function setIngredientAvailability(ingredientId, supermarketId, status) {
  const { error } = await supabase
    .from("ingredient_availability")
    .upsert({ ingredient_id: ingredientId, supermarket_id: supermarketId, status }, { onConflict: "ingredient_id,supermarket_id" });
  if (error) throw error;
}

// How many recipe-uses one typical purchase of this ingredient covers — see
// lib.js's isRegular for how this decides whether it starts crossed off.
export async function setIngredientRecipesPerUnit(ingredientId, recipesPerUnit) {
  const { error } = await supabase.from("ingredients").update({ recipes_per_unit: recipesPerUnit }).eq("id", ingredientId);
  if (error) throw error;
}

// Which aisle this ingredient sorts into on the grocery list (or null for
// "doesn't matter" — dairy, frozen, household items) — see lib.js's
// AISLE_ORDER/compareByAisle for how this drives Lijst/Winkel ordering.
export async function setIngredientAisleCategory(ingredientId, aisleCategory) {
  const { error } = await supabase.from("ingredients").update({ aisle_category: aisleCategory }).eq("id", ingredientId);
  if (error) throw error;
}

// Household staples bought on a fixed weekly cadence (boter, koffie, wc
// papier...) rather than driven by a recipe — see lib.js's isRecurringDue.

export async function fetchRecurringItems() {
  const { data, error } = await supabase.from("recurring_items").select("ingredient_id,interval_weeks,last_bought_week,ingredients(name)");
  if (error) throw error;
  return data;
}

// Only touches interval_weeks — on an existing row this leaves
// last_bought_week untouched, on a brand new one it stays null (due
// immediately, on the assumption a freshly-tracked item isn't already
// known to be in stock).
export async function upsertRecurringItem(ingredientId, intervalWeeks) {
  const { error } = await supabase
    .from("recurring_items")
    .upsert({ ingredient_id: ingredientId, interval_weeks: intervalWeeks }, { onConflict: "ingredient_id" });
  if (error) throw error;
}

export async function markRecurringItemBought(ingredientId, weekStart) {
  const { error } = await supabase.from("recurring_items").update({ last_bought_week: weekStart }).eq("ingredient_id", ingredientId);
  if (error) throw error;
}

export async function removeRecurringItem(ingredientId) {
  const { error } = await supabase.from("recurring_items").delete().eq("ingredient_id", ingredientId);
  if (error) throw error;
}

// One-off items added directly to a specific week's list from Lijst's "voeg
// item toe" bar, rather than coming from a planned recipe or a recurring
// staple. Upserting is idempotent, so adding the same item to the same week
// twice is harmless.
export async function addGroceryOverride(weekStart, ingredientId) {
  const { error } = await supabase
    .from("grocery_overrides")
    .upsert({ week_start: weekStart, ingredient_id: ingredientId, action: "include" }, { onConflict: "week_start,ingredient_id" });
  if (error) throw error;
}

export async function removeGroceryOverride(weekStart, ingredientId) {
  const { error } = await supabase
    .from("grocery_overrides")
    .delete()
    .eq("week_start", weekStart)
    .eq("ingredient_id", ingredientId);
  if (error) throw error;
}
