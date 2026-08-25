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
