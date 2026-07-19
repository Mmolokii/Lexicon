# Lexicon

A browser-based JSON explorer built in vanilla JavaScript with zero dependencies.

**Live:** https://lexicon-ruddy-kappa.vercel.app

---

## What it does

Paste any JSON string and get an interactive collapsible tree with full keyboard support, real-time search, and a right-click context menu.

![Lexicon — JSON Explorer](https://lexicon-ruddy-kappa.vercel.app)

---

## Features

### JSON Explorer

- Syntax highlighting by type — strings, numbers, booleans, null, and brackets each have distinct colors
- Click any node to copy its full dot-notation path (`address.geo.lat`) to the clipboard
- Collapsible/expandable nodes — click anywhere on a branch row to toggle
- Double-click a branch to recursively expand or collapse its entire subtree
- Count badges on collapsed nodes showing `3 keys` or `7 items`
- Type badges appear on row hover (`string`, `number`, `boolean`, `null`, `object`, `array`)

### Search

- `⌘F` opens real-time search across all keys and values
- Matching nodes are highlighted with the matched substring in amber
- Non-matching nodes dim to 25% opacity — structural context stays visible
- Collapsed ancestors of matches auto-expand so matches are never hidden
- Match counter shows `N matches` — turns red when no results
- `Tab` from the search bar moves focus directly to the first match in the tree
- `Escape` closes search and restores the full tree

### URL Loading

- Switch to URL mode and paste any public JSON endpoint
- Loading states: spinner during fetch, ✓ with duration on success, ✗ with error message on failure
- Quick URL buttons for common test endpoints
- Timeout after 10 seconds with a clear error message
- In-flight requests cancelled automatically when a new request starts

### Context Menu

Right-click any node for:

- Copy path — dot-notation path to the clipboard
- Copy value — raw primitive value or single-line JSON for objects/arrays
- Copy subtree as JSON — pretty-printed JSON of the node and all descendants
- Expand subtree — recursively expand all children
- Collapse subtree — recursively collapse all children

### Output Toolbar

- Collapse to depth 1, 2, or 3 with a single click
- Expand all / Collapse all buttons
- Active depth button highlighted

### Accessibility

- Full keyboard navigation with arrow keys, `Enter`, `Space`
- `aria-activedescendant` updates as focus moves through the tree
- Focus trap inside the shortcuts overlay — `Tab` never escapes the modal
- Skip link on first `Tab` press jumps directly to the tree
- `role="status"` on the search count announces results to screen readers
- `focus-visible` styles on all interactive elements

### App

- Dark and light theme (`⌘⇧L` to toggle)
- Draggable pane divider — resize input and output panes
- `?` key opens the keyboard shortcuts overlay
- All shortcuts shown in the overlay with visual `kbd` chips

---

## Keyboard Shortcuts

| Shortcut | Action                                                       |
| -------- | ------------------------------------------------------------ |
| `⌘↵`     | Parse JSON                                                   |
| `⌘⇧F`    | Format / prettify input                                      |
| `⌘⇧X`    | Clear input and reset tree                                   |
| `⌘F`     | Open search                                                  |
| `⌘⇧A`    | Expand all nodes                                             |
| `⌘⇧0`    | Collapse all nodes                                           |
| `↑` `↓`  | Move focus up / down in tree                                 |
| `→`      | Expand focused node (or move to first child)                 |
| `←`      | Collapse focused node (or move to parent)                    |
| `Enter`  | Copy path of focused node                                    |
| `Space`  | Toggle focused branch node                                   |
| `⌘⇧L`    | Toggle dark / light theme                                    |
| `⌘⇧U`    | Switch to URL input mode                                     |
| `⌘⇧P`    | Switch to paste mode                                         |
| `?`      | Open keyboard shortcuts overlay                              |
| `Esc`    | Close overlay → search → clear selection (in priority order) |

---

## Architecture

Zero frameworks. Zero build tools. Zero dependencies. Six modules with explicit, non-overlapping responsibilities.

```
lexicon/
├── index.html
├── styles/
│   └── main.css
├── js/
│   ├── utils.js
│   ├── parser.js
│   ├── fetcher.js
│   ├── search.js
│   ├── focus-trap.js
│   └── renderer.js
│   └── main.js
├── vercel.json
└── README.md
```

### Module responsibilities

**`utils.js`** — Pure helper functions. No DOM access, no state, no side effects.

| Function                     | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `getType(value)`             | Fixes `typeof null === 'object'` and `typeof [] === 'object'`          |
| `getSize(jsonString)`        | UTF-8 byte count via `TextEncoder` — accurate for emoji and non-ASCII  |
| `countNodes(data)`           | Recursive node count including containers                              |
| `getDepth(data)`             | Maximum nesting depth via recursive `Math.max`                         |
| `copyToClipboard(text)`      | Clipboard API with `execCommand` fallback, returns `boolean`           |
| `formatJSON(str)`            | Parse then re-stringify with 2-space indent, returns `null` on failure |
| `debounce(fn, delay)`        | Closure over `timer` — cancels previous call before starting new       |
| `getValueAtPath(data, path)` | Walks dot-notation paths including bracket notation (`orders[0].id`)   |

**`parser.js`** — Safe JSON parsing. One function. Never throws.

```javascript
// Returns one of two shapes — callers switch on ok
{ ok: true,  data: <parsed value>, raw: <string> }
{ ok: false, error: <string>, position: <number|null> }
```

Converts `JSON.parse`'s thrown `SyntaxError` into a typed return value. Extracts error position from the message via two regex patterns (Chrome and Safari format differently). Empty input returns `{ ok: false, error: 'Input is empty' }` before `JSON.parse` is ever called.

**`fetcher.js`** — URL loading with typed error returns.

Five error types, each producing a distinct UI message:

| Type      | Cause                                                                 |
| --------- | --------------------------------------------------------------------- |
| `abort`   | Cancelled by user or superseded by newer request — silently swallowed |
| `timeout` | Request exceeded 10 seconds — separate `AbortController` fires        |
| `network` | DNS failure, offline, CORS block                                      |
| `http`    | Server returned non-200 status (`404 Not Found`, etc.)                |
| `parse`   | Response body was not valid JSON                                      |

Timeout and cancellation are separate `AbortController` instances merged with `combineSignals` — whichever fires first aborts the fetch.

The concurrency guard:

```javascript
const controller = new AbortController();
activeFetchController = controller;

const result = await fetchJSON(url, controller.signal);

// If a newer request started while this one was in flight, bail silently
// Without this, the aborted call's cleanup would overwrite the newer
// call's loading state — re-enabling the button, hiding the spinner
if (activeFetchController !== controller) return;
```

**`search.js`** — Search logic. Operates on both the raw data and the rendered DOM in sequence.

The two-pass pattern:

```
Pass 1 — data walk (before render):
  collectMatchingPaths(data, regex)
    → walks every key and primitive value recursively
    → returns Set of paths whose key or value matches the query

  getAncestorPaths(path)
    → splits "address.geo.lat" into ["address", "address.geo"]
    → these rows must stay visible for context

  renderer.expandPaths(ancestorPaths)
    → removes ancestors from collapsedPaths
    → ensures their child rows will exist after re-render

Pass 2 — DOM walk (after render):
  applySearch(query, data, container)
    → adds .tree-row--matched, .tree-row--dimmed, .tree-row--ancestor
    → calls highlightMatches on matched rows

  highlightMatches(element, regex)
    → uses TreeWalker to find text nodes (never innerHTML — XSS safe)
    → wraps matched substrings in <mark class="search-highlight">
    → uses createDocumentFragment for efficient DOM insertion
```

Why two passes? Matches inside collapsed nodes have no DOM rows. They cannot be highlighted until their ancestors are expanded and the tree is re-rendered. The data walk finds them first; the DOM walk highlights them after.

**`focus-trap.js`** — Keyboard focus containment for modals.

```javascript
const trap = createFocusTrap(containerEl);
trap.activate(); // saves previouslyFocused, focuses first element, adds Tab listener
trap.deactivate(); // removes Tab listener, restores previouslyFocused
```

Queries all focusable elements dynamically on each Tab press — handles elements inside `[hidden]` parents correctly. Wraps `Tab` forward (last → first) and `Shift+Tab` backward (first → last).

**`renderer.js`** — Builds the DOM tree from parsed data. Maintains collapse state privately via closure.

The factory pattern:

```javascript
const createRenderer = () => {
  const collapsedPaths = new Set(); // private — not accessible outside
  let focusedPath = null;           // private — tracks keyboard focus

  // ... private helpers ...

  return { render, handleKeyNav, collapseToDepth, ... }; // public API only
};
```

`collapsedPaths` is genuinely private. `main.js` cannot read or mutate it directly — only through the exported methods. This is the module pattern without a bundler.

Keyboard navigation (`handleKeyNav`):

| Key          | Behaviour                                     |
| ------------ | --------------------------------------------- |
| `ArrowDown`  | Next visible row                              |
| `ArrowUp`    | Previous visible row                          |
| `ArrowRight` | Expand if collapsed, else move to first child |
| `ArrowLeft`  | Collapse if expanded, else move to parent     |
| `Enter`      | Select row and copy path                      |
| `Space`      | Toggle collapse on branch nodes               |

`aria-activedescendant` is updated on every focus change — screen readers announce the newly focused row without moving browser focus away from the tree container.

**`main.js`** — Entry point. Wires everything together. Owns application state and all event listeners.

```javascript
// Application state — all in one place
let currentData = null; // last successfully parsed value
let currentRaw = ''; // last successfully parsed string
let toastTimer = null; // setTimeout ID for toast dismiss
let isSearchActive = false; // search bar visible
let currentQuery = ''; // current search string
let contextMenuPath = null; // path of right-clicked node
let shortcutsTrap = null; // focus trap instance
let activeFetchController = null; // AbortController for URL fetch
```

The `onSelectHandler` callback is defined once and passed to `renderer.render` everywhere — no inline arrow functions duplicated across call sites.

---

### State / UI separation

The DOM is never the source of truth. The count in the status bar comes from `countNodes(currentData)`, not from counting DOM elements. The collapsed state lives in the renderer's closure. Resetting after new JSON is parsed means calling `renderer.clearCollapsed()` — not querying the DOM.

This is the same principle as React's unidirectional data flow, implemented without a framework.

---

### Design system

All colors, spacing, and sizing are CSS custom properties defined in `:root`. No magic numbers anywhere in the stylesheet.

```css
/* Semantic color tokens — dark theme */
--json-key: #c4c4cc /* reads first — brightest */ --json-string: #a78bfa
  /* soft violet */ --json-number: #34d399 /* muted emerald */
  --json-bool-true: #34d399 /* same as number */ --json-bool-false: #f87171
  /* muted red */ --json-null: #636369 /* recedes — null is absence of value */
  --json-bracket: #4b4b55 /* near-invisible — structural, not semantic */;
```

Light theme overrides the same tokens — the component CSS never changes.

---

## What I learned building this

**The ancestor expansion problem** was the most interesting engineering challenge of the build. When a match is three levels inside a collapsed node, the DOM row for that match does not exist — it was never rendered. The naive approach of walking the DOM to find matches fails entirely in this case. The solution was recognising that search needed to operate in two passes: walk the raw data first to find matching paths, compute their ancestor paths, expand those ancestors in the renderer, re-render, then apply visual state to the newly rendered rows. This distinction between the data model and its DOM representation became concrete in a way that made React's reconciliation algorithm immediately legible when I encountered it later.

**Closure as a module boundary.** The renderer's `collapsedPaths` Set is completely inaccessible from outside `createRenderer`. There is no way to reach it from `main.js` except through the exported methods. I built this pattern before learning about ES modules — understanding why it works made `import`/`export` feel like syntax sugar over something I already understood structurally.

**AbortController composes cleanly.** Timeout and cancellation are two separate concerns that both need to abort the same `fetch` call. Rather than one controller trying to handle both, `combineSignals` merges two controllers into one: whichever fires first aborts the request. The fetch does not need to know why it was aborted — it just receives a signal.

**The concurrency guard pattern.** Saving the controller locally before assigning it to the shared variable, then checking `activeFetchController !== controller` after the `await`, is the correct way to handle overlapping async operations. Without it, the aborted call's cleanup code runs over the newer call's loading state — re-enabling the button and hiding the spinner while the second request is still in flight. This bug is invisible during normal single-request testing and only surfaces when two requests overlap.

**`innerHTML` is never the right tool for user content.** The search highlight implementation uses `TreeWalker` to find text nodes and `createDocumentFragment` to replace them — never `innerHTML`. This is slower to write and faster to reason about from a security perspective. Any value that originates from user input, an API response, or `localStorage` going through `innerHTML` is an XSS vulnerability waiting to be found.

---

## Running locally

No build step. No package manager. Open `index.html` directly in a browser, or use any static file server:

```bash
# Using Python
python3 -m http.server 3000

# Using Node
npx serve .

# Using VS Code
# Install Live Server extension → right-click index.html → Open with Live Server
```

Note: the Clipboard API requires a secure context (HTTPS or localhost). Running via `file://` will fall back to the `execCommand` clipboard method.

---

## Built during

Month 1, Week 2 of a 20-month full-stack engineering roadmap.
Days 8–14: one feature per day, one branch per feature,
merged to `dev` then `main` at end of week.

**Branch strategy:**

```
main     — always deployable, receives merges from dev only
dev      — integration branch
feature/ — one branch per day's work
fix/     — bug fixes
docs/    — documentation
```

**Commit convention:** Conventional Commits with scope

```
feat(renderer): add full-row click and double-click subtree expand
fix(main): guard loadFromUrl against stale abort cleanup on concurrent requests
docs: add Lexicon v1 README with architecture and keyboard shortcuts
```

---

## Roadmap

Week 3 (Days 15–21) adds:

- **Diff mode** — structural comparison of two JSON payloads with additions (green), deletions (red), and changes (amber)
- **ES modules refactor** — `import`/`export` replacing global script tags
- **localStorage persistence** — save last JSON and theme preference across sessions
- **Performance** — targeted DOM updates instead of full re-render on collapse/expand
- **Export** — download current JSON as a formatted file

---

_Lexicon is part of a portfolio built across 20 months targeting full-stack engineering roles in South Africa and internationally._
