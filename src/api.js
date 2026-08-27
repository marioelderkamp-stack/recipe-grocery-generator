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
  const [ingRows, riRows, availRows] = await Promise.all([
    supabase.from("ingredients").select("id,name").order("name", { ascending: true }),
    supabase.from("recipe_ingredients").select("ingredient_id"),
    supabase.from("ingredient_availability").select("ingredient_id,supermarket_id,status"),
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

  return { ingredients: ingRows.data, usageCounts, availability };
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

  // ingredient_restock has one row per ingredient (PK on ingredient_id) — only
  // repoint fromId's row if intoId isn't already tracked, otherwise intoId's
  // row wins and fromId's is dropped by the cascade-delete below.
  const { data: intoRestock, error: intoRestockErr } = await supabase.from("ingredient_restock").select("ingredient_id").eq("ingredient_id", intoId).maybeSingle();
  if (intoRestockErr) throw intoRestockErr;
  if (!intoRestock) {
    const { error: restockErr } = await supabase.from("ingredient_restock").update({ ingredient_id: intoId }).eq("ingredient_id", fromId);
    if (restockErr) throw restockErr;
  }

  // grocery_overrides is keyed (week_start, ingredient_id) — repoint only the
  // weeks intoId doesn't already have an override for, to avoid a PK
  // collision; the rest cascade-delete along with fromId's ingredients row.
  const [fromOverrides, intoOverrides] = await Promise.all([
    supabase.from("grocery_overrides").select("week_start").eq("ingredient_id", fromId),
    supabase.from("grocery_overrides").select("week_start").eq("ingredient_id", intoId),
  ]);
  if (fromOverrides.error) throw fromOverrides.error;
  if (intoOverrides.error) throw intoOverrides.error;
  const intoWeeks = new Set(intoOverrides.data.map((r) => r.week_start));
  const movableWeeks = fromOverrides.data.map((r) => r.week_start).filter((w) => !intoWeeks.has(w));
  if (movableWeeks.length > 0) {
    const { error: overrideErr } = await supabase.from("grocery_overrides").update({ ingredient_id: intoId }).eq("ingredient_id", fromId).in("week_start", movableWeeks);
    if (overrideErr) throw overrideErr;
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

// Voorraad: self-tuning restock reminders (see lib.js's RESTOCK_CATEGORIES /
// isRestockDue for the read side of this).

export async function fetchIngredientRestock() {
  const { data, error } = await supabase
    .from("ingredient_restock")
    .select("ingredient_id,category,last_bought_week,avg_interval_weeks,ingredients(name)");
  if (error) throw error;
  return data;
}

// Opts an ingredient into tracking. last_bought_week defaults to the
// currently-viewed week — assume "I have some now" so the item doesn't
// immediately read as overdue the moment it's tracked.
export async function upsertIngredientRestock(ingredientId, category, weekStart) {
  const { error } = await supabase
    .from("ingredient_restock")
    .upsert({ ingredient_id: ingredientId, category, last_bought_week: weekStart }, { onConflict: "ingredient_id" });
  if (error) throw error;
}

// Edits only the category — does not touch the learned buying-history columns.
export async function updateRestockCategory(ingredientId, category) {
  const { error } = await supabase.from("ingredient_restock").update({ category }).eq("ingredient_id", ingredientId);
  if (error) throw error;
}

// The self-tuning step: nudges the learned average interval toward the gap
// since the previous purchase (a simple exponential moving average) whenever
// an item is marked bought, so its due-estimate keeps converging on how
// often the household actually buys it.
export async function markIngredientBought(ingredientId, weekStart) {
  const { data: current, error: readErr } = await supabase
    .from("ingredient_restock")
    .select("last_bought_week,avg_interval_weeks")
    .eq("ingredient_id", ingredientId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) return;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const interval = Math.round((new Date(weekStart) - new Date(current.last_bought_week)) / msPerWeek);
  const avgIntervalWeeks = current.avg_interval_weeks == null
    ? interval
    : Math.round((current.avg_interval_weeks * 0.7 + interval * 0.3) * 10) / 10;
  const { error: writeErr } = await supabase
    .from("ingredient_restock")
    .update({ prev_bought_week: current.last_bought_week, last_bought_week: weekStart, avg_interval_weeks: avgIntervalWeeks })
    .eq("ingredient_id", ingredientId);
  if (writeErr) throw writeErr;
}

export async function removeIngredientRestock(ingredientId) {
  const { error } = await supabase.from("ingredient_restock").delete().eq("ingredient_id", ingredientId);
  if (error) throw error;
}

export async function fetchGroceryOverrides(weekStart) {
  const { data, error } = await supabase
    .from("grocery_overrides")
    .select("ingredient_id,action,ingredients(name)")
    .eq("week_start", weekStart);
  if (error) throw error;
  return data;
}

export async function setGroceryOverride(weekStart, ingredientId, action) {
  const { error } = await supabase
    .from("grocery_overrides")
    .upsert({ week_start: weekStart, ingredient_id: ingredientId, action }, { onConflict: "week_start,ingredient_id" });
  if (error) throw error;
}

export async function clearGroceryOverride(weekStart, ingredientId) {
  const { error } = await supabase.from("grocery_overrides").delete().eq("week_start", weekStart).eq("ingredient_id", ingredientId);
  if (error) throw error;
}
