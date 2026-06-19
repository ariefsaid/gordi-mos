# MOS Design Kit — Acme Inc UI kit

A buildless, click-through prototype of a CRM-style workspace (**"Acme Inc"**),
composed from the MOS Design Kit primitives. React 18 + Babel via CDN — no build
step, no bundler, no npm. Open `index.html` over HTTP and click around.

## What's here

| File | Role |
|---|---|
| `icons.jsx` | `Ti` + `mkIcon` helpers over the Tabler webfont (`window.Ti`, `window.mkIcon`). |
| `data.js` | Generic mock data on `window.MOS_DATA` + `window.fmtMoney` / `window.fmtNum`. |
| `LoginScreen.jsx` | Centered auth card. Any click signs in. |
| `Sidebar.jsx` | 236px left rail: workspace switcher, ⌘K search, Favorites, Workspace nav, user chip. |
| `RecordTable.jsx` | Companies table — signature dense list (hover checkboxes, Chip openers, Tags, tabular money). |
| `RecordPage.jsx` | Two-column record (332px details + tabbed Timeline/Tasks/Notes/Files feed). |
| `Kanban.jsx` | Opportunities board (248px columns, sums, hover-lift cards). |
| `index.html` | App shell + state machine: `login → app shell (Sidebar + RecordTable / Kanban / RecordPage)`. |

Primitives live one level up at `../../components/` and register on
`window.MosDesignKit`. Every screen reads them off that global. Styling is
exclusively `--ds-*` tokens (see `../../styles.css`); nothing is hardcoded.

## Run it

```bash
cd docs/reference/mos-design-kit
python3 -m http.server 8099
# open http://localhost:8099/ui_kits/mos/index.html
```

(Serve over HTTP — Babel in-browser fetch won't load the `.jsx` from `file://`.)

## Click-through

1. **Login** → click *Continue with Google* / the *Continue* button → you land in the app.
2. **Sidebar → Workspace → Opportunities** (or the table header's column-layout icon) → switch to the **Kanban** board. The board header's list icon switches back.
3. **RecordTable** → click any **company Chip** in the Name column → opens the **RecordPage**. Use the breadcrumb **Companies** to go back.
4. Hover a table row to reveal its **checkbox**; the header checkbox selects-all with an **indeterminate** mid state.
5. **RecordPage** → try the Timeline / Tasks / Notes / Files tabs (notes render on a soft yellow card; money/tasks are tabular).

## Theming

Light theme is the default on `:root`. To preview dark, add `class="dark"` to any
container (the tokens flip everywhere beneath it). The component gallery at
`../../components/components.html` shows every primitive in both themes.

## Notes

- All copy/brand is **"Acme Inc"** — illustrative only. Company names are generic.
- This is a reference prototype, not the MOS app. It exists to fix the visual +
  interaction language (rail, record table, record page, kanban) before app code.
