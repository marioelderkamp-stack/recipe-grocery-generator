// Supabase read/write helpers shared across the app.

import { supabase } from "./supabaseClient";

export async function fetchRecipesFromDb() {
  const { data, error } = await supabase
    .from("recipes")
    .select("id,name,tag,instructions,created_at,recipe_ingredients(quantity,sort_order,ingredients(name))")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    tag: r.tag,
    instructions: r.instructions,
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

export async function setIngredientAvailability(ingredientId, supermarketId, status) {
  const { error } = await supabase
    .from("ingredient_availability")
    .upsert({ ingredient_id: ingredientId, supermarket_id: supermarketId, status }, { onConflict: "ingredient_id,supermarket_id" });
  if (error) throw error;
}
