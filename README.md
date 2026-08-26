# Kookplan

A weekly meal planner and grocery-list generator (Dutch UI). React + Vite, no
backend — recipes, the cooking history, and the checked-off grocery items are
all persisted to the browser's `localStorage`.

## Local development

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. `npm run build` produces a static `dist/`
bundle; `npm run preview` serves that bundle locally.

## Project structure

- `src/App.jsx` — the whole app (planner, recipe manager, grocery list).
- `src/main.jsx` — React entry point.
- `index.html` — Vite entry HTML.

## Workflow

- Work happens on feature branches; open a PR into `main`.
- `.github/workflows/ci.yml` runs lint + build on every push/PR.
- Vercel is connected to this repo: pushes to `main` deploy to production,
  and every PR gets its own preview URL automatically — no manual deploy
  step needed.

## Data model notes

- Recipes and the day→recipe cooking history live under `weekboek:recipes`
  and `weekboek:history` in `localStorage`; per-week checked grocery items
  live under `weekboek:week:<date>:checked`. There's no sync between
  devices/browsers — it's local to whichever browser you use.
