# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
The user and their household — a personal meal-planning tool for people who cook and shop together, not a multi-tenant product for strangers. No accounts or sign-up; anyone with the link shares the same plan.

## Product Purpose
One-click optimization of the weekly dinner experience for the least amount of effort and cost: generate a week of dinners from a personal recipe collection, automatically avoiding recent repeats, and produce a grocery list already sorted by which store to buy each item from.

## Positioning
Ties each recipe's ingredients to real per-supermarket availability (Lidl, Albert Heijn, Ekoplaza — bio vs. non-bio vs. unavailable) so the grocery list says exactly where to shop, not just what to buy, and lets the household pick between minimizing store trips or maximizing organic purchases with a single slider. A built-in 2-day cook rhythm (zondag/dinsdag/donderdag anchor a day plus the next, repeating the same dish) treats leftovers as the plan rather than an afterthought.

## Operating Context
Used on a phone, in the kitchen and at the store, in Dutch throughout. Weekly cycle: generate or hand-pick the week's dinners, lock the plan once shopping starts, tick off groceries while shopping, then review the week afterward (thumbs up, or thumbs down to pause or delete recipes that didn't work out).

## Capabilities and Constraints
- No login or accounts today — a single shared household database (Supabase, permissive access).
- Dutch-only UI today.
- Store-availability data is specific to Lidl, Albert Heijn, and Ekoplaza, not a generic multi-store framework.
- Ingredient quantities are free text (e.g. "2,5 blik", "4,5 el"), not structured amounts — this is why a per-recipe nutrition score was scoped out earlier as impractical without a large, fragile unit-conversion effort.
- Cook rhythm: zondag, dinsdag, and donderdag are 2-day cook anchors (that day plus the next repeat the same dish); zaterdag is optional and manual-only.

## Brand Commitments
Product name is "Kookplan" (renamed from an earlier working name, "Het Weekboek") — a confirmed, binding choice, not a placeholder.

## Evidence on Hand
21 real recipes and roughly 230 real ingredients with actual per-store availability data already entered — not placeholder or demo content.

## Product Principles
- Optimize every dinner for least effort and cost, not culinary ambition or variety for its own sake.
- Keep the household in control: every automated suggestion (the weekly plan, store assignment) stays manually overridable, deletable, or lockable rather than fully autonomous.
- Prefer real, observable shopping constraints (what's actually stocked at Lidl/AH/Ekoplaza) over abstract or idealized data sources when the two would otherwise conflict.
