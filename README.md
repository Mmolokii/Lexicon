# Lexicon

> **Version:** Day 8 (v0.1.0)
> **Status:** Active development — Month 1, Week 2
> **Stack:** Vanilla JavaScript, HTML, CSS — zero dependencies

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [File Structure](#file-structure)
3. [Architecture](#architecture)
4. [Data Flow](#data-flow)
5. [File Reference](#file-reference)
   - [utils.js](#utilsjs)
   - [parser.js](#parserjs)
   - [renderer.js](#rendererjs)
   - [main.js](#mainjs)
   - [main.css](#maincss)
   - [index.html](#indexhtml)
6. [Design Tokens](#design-tokens)
7. [State Management](#state-management)
8. [Event System](#event-system)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Known Limitations](#known-limitations)
11. [Roadmap](#roadmap)
12. [Debugging Reference](#debugging-reference)
13. [Git History](#git-history)

---

## Project Overview

Lexicon is a browser-based JSON explorer and diff tool. It takes a raw JSON string as input and renders it as an interactive, collapsible tree. Clicking any node copies its full dot-notation path to the clipboard.

**Day 8 feature set:**

- Paste or type JSON → instant tree render
- Collapsible/expandable nodes with count badges
- Click any node → path copied to clipboard + toast confirmation
- Type badge on row hover (`string`, `number`, `boolean`, `null`, `object`, `array`)
- Format button (prettify raw JSON)
- Clear button
- Copy raw JSON button
- Dark / light theme toggle
- Draggable pane divider
- Status bar: node count, max depth, file size
- Debounced auto-parse (400ms after typing stops)
- Keyboard shortcuts
- Error strip for malformed JSON
- Demo JSON loads on startup

---

## File Structure

```text
lexicon/
├── index.html           — HTML shell, element IDs, script tags
├── styles/
│   └── main.css         — Design tokens, layout, all component styles
└── src/
    ├── utils.js         — Pure helper functions (no DOM, no state)
    ├── parser.js        — Safe JSON parsing, returns typed result
    ├── renderer.js      — Builds DOM tree from parsed data
    └── main.js          — Entry point, wires everything together
```

> **Note:** Scripts load via plain `<script>` tags in this order:
> `utils.js` → `parser.js` → `renderer.js` → `main.js`
>
> Each file depends on globals defined by earlier files. This is
> the Day 8 approach — ES modules with `import/export` arrive on Day 19.

---

## Architecture

### Responsibility Map

```text
┌─────────────────────────────────────────────────────────────┐
│                         main.js                             │
│                                                             │
│  Owns: DOM refs, application state, event listeners,        │
│        UI helpers (showError, showToast, updateStatus)      │
│                                                             │
│  Does NOT: parse JSON, build DOM nodes, define utilities    │
└──────────┬──────────────────────────┬───────────────────────┘
           │ calls                    │ calls
           ▼                          ▼
┌──────────────────┐      ┌───────────────────────────────────┐
│   parser.js      │      │          renderer.js              │
│                  │      │                                   │
│  parseJSON(str)  │      │  createRenderer() → instance      │
│                  │      │  instance.render(el, data, cb)    │
│  Returns typed   │      │  instance.clearCollapsed()        │
│  result object   │      │                                   │
│  Never throws    │      │  Owns: collapsed state (closure)  │
│  No DOM access   │      │  No knowledge of toast/status bar │
└──────────────────┘      └───────────────────────────────────┘
           │                          │
           └──────────┬───────────────┘
                      │ both use
                      ▼
           ┌──────────────────────┐
           │      utils.js        │
           │                      │
           │  getType             │
           │  getSize             │
           │  countNodes          │
           │  getDepth            │
           │  copyToClipboard     │
           │  formatJSON          │
           │  debounce            │
           │                      │
           │  Pure functions only │
           │  No DOM, no state    │
           └──────────────────────┘
```

### Core Design Principles

**1. No file touches another file's concern**
`parser.js` never touches the DOM. `renderer.js` never calls `parseJSON`. `utils.js` has no knowledge of either. Violations of these boundaries are architecture bugs.

**2. Functions return values, not side effects**
`parseJSON` returns a result object. `createRenderer` returns an instance. `copyToClipboard` returns a Promise that resolves to a boolean. Callers decide what to do with results.

**3. State lives in one place**
Application state (`currentData`, `currentRaw`) lives in `main.js`. Collapse state lives inside `createRenderer`'s closure. Nothing else holds state.

**4. The DOM is never the source of truth**
The tree is always rebuilt from `currentData`, never read back from the DOM. The count in the status bar comes from `countNodes(currentData)`, not from counting DOM elements.

---

## Data Flow

### Parse and Render Flow

```text
User types or pastes JSON
        │
        ▼
  input event fires
        │
        ▼
  debouncedParse        ← waits 400ms after last keystroke
        │
        ▼
  parseAndRender()      [main.js]
        │
        ├─── input empty?
        │         └── showEmptyState() + clearStatus() → done
        │
        ├─── parseJSON(input)   [parser.js]
        │         │
        │         ├── ok: false → showError(message) → done
        │         │
        │         └── ok: true → { data, raw }
        │
        ├─── renderer.clearCollapsed()
        │
        ├─── renderer.render(container, data, onSelectCallback)
        │         │
        │         └─── renderNode('', data, 0, '')   [recursive]
        │                   │
        │                   ├── buildRow(key, value, depth, path, ...)
        │                   │         └── appended to container
        │                   │
        │                   ├── renderNode(childKey, childVal, depth+1, childPath)
        │                   │         └── [recursion continues]
        │                   │
        │                   └── buildClosingRow(type, depth)
        │                             └── appended to container
        │
        ├─── showTree()
        │
        └─── updateStatus(data, raw)
                  │
                  ├── countNodes(data)  → "32 nodes"
                  ├── getDepth(data)   → "depth: 4"
                  └── getSize(raw)     → "~0.5KB"
```

### Node Click Flow

```text
User clicks a tree row
        │
        ▼
  handleSelect(path, rowEl)     [inside renderer.js]
        │
        ├── clear .tree-row--selected from all rows
        ├── add .tree-row--selected to clicked row
        │
        └── onSelect(path)      [callback passed from main.js]
                  │
                  ├── showPathInStatus(path)
                  │         └── ELEMENTS.statusPath.textContent = path
                  │
                  └── copyToClipboard(path)    [utils.js]
                            │
                            └── success → showToast('Path copied', path)
```

### Collapse Toggle Flow

```text
User clicks chevron on a branch node
        │
        ▼
  toggle click listener         [inside buildRow, renderer.js]
        │
        ├── e.stopPropagation() — prevents row select handler firing
        │
        └── onToggle(path)
                  │
                  ├── collapsedPaths.has(path)?
                  │         ├── yes → collapsedPaths.delete(path)
                  │         └── no  → collapsedPaths.add(path)
                  │
                  └── render(container, data, onSelect)
                            └── full re-render with updated collapsed state
```

---

## File Reference

---

### `utils.js`

**Responsibility:** Pure helper functions. No DOM, no state, no imports.
Loaded first — all functions are available globally to subsequent scripts.

---

#### `getType(value)`

```javascript
const getType = value => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};
```

| Input     | Output      |
| --------- | ----------- |
| `null`    | `'null'`    |
| `[1, 2]`  | `'array'`   |
| `{}`      | `'object'`  |
| `'hello'` | `'string'`  |
| `42`      | `'number'`  |
| `true`    | `'boolean'` |

**Why it exists:** `typeof null === 'object'` and `typeof [] === 'object'` are JavaScript bugs from 1995. This function fixes both before falling back to `typeof`.

**Used by:** `renderer.js` (every node), `countNodes`, `getDepth`

---

#### `getSize(jsonString)`

```javascript
const getSize = jsonString => {
  const bytes = new TextEncoder().encode(jsonString).length;
  if (bytes < 1024) return `~${bytes}B`;
  return `~${(bytes / 1024).toFixed(1)}KB`;
};
```

Uses `TextEncoder` for accurate UTF-8 byte count rather than `.length` (which counts UTF-16 code units — incorrect for emoji and non-ASCII characters).

**Returns:** `'~7B'` or `'~12.4KB'`
**Used by:** `updateStatus()` in `main.js`

---

#### `countNodes(value)`

```javascript
const countNodes = value => {
  const type = getType(value);
  if (type === 'object') {
    return 1 + Object.values(value).reduce((sum, v) => sum + countNodes(v), 0);
  }
  if (type === 'array') {
    return 1 + value.reduce((sum, v) => sum + countNodes(v), 0);
  }
  return 1;
};
```

Recursive. Counts the container itself (`1 +`) plus all descendants.
Base case: any primitive returns `1`.

**Example trace:**

```
countNodes({ a: 1, b: [2, 3] })
= 1 + countNodes(1) + countNodes([2,3])
= 1 + 1 + (1 + countNodes(2) + countNodes(3))
= 1 + 1 + (1 + 1 + 1)
= 5
```

**Used by:** `updateStatus()` in `main.js`

---

#### `getDepth(value, current = 0)`

```javascript
const getDepth = (value, current = 0) => {
  const type = getType(value);
  if (type === 'object') {
    const values = Object.values(value);
    if (values.length === 0) return current;
    return Math.max(...values.map(v => getDepth(v, current + 1)));
  }
  if (type === 'array') {
    if (value.length === 0) return current;
    return Math.max(...value.map(v => getDepth(v, current + 1)));
  }
  return current;
};
```

Recursive. `current` tracks depth at each call. `Math.max` finds the deepest branch.
Empty objects/arrays short-circuit to avoid `Math.max()` with no arguments (returns `-Infinity`).

**Used by:** `updateStatus()` in `main.js`

---

#### `copyToClipboard(text)`

```javascript
const copyToClipboard = async text => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // execCommand fallback for older browsers / non-HTTPS
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
};
```

Two attempts. Modern Clipboard API first, `execCommand` fallback second.
Returns `true` on success, `false` on failure — never throws.

**Used by:** node click handler and copy-raw button in `main.js`

---

#### `formatJSON(jsonString)`

```javascript
const formatJSON = jsonString => {
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  } catch {
    return null;
  }
};
```

Parse → re-stringify with 2-space indentation. Returns `null` on invalid JSON.
Caller checks for `null` and shows error message.

**Used by:** format button handler in `main.js`

---

#### `debounce(fn, delay)`

```javascript
const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
```

Returns a new function that delays `fn` until `delay`ms after the last call.
`timer` persists between calls via closure — the key mechanism.

**Used by:** `input` event listener in `main.js` (400ms delay)

---

### `parser.js`

**Responsibility:** Safe JSON parsing. One function. Never throws. No DOM access.

---

#### `parseJSON(input)`

```javascript
const parseJSON = input => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Input is empty', position: null };
  }
  try {
    const data = JSON.parse(trimmed);
    return { ok: true, data, raw: trimmed };
  } catch (err) {
    const positionMatch =
      err.message.match(/position (\d+)/i) || err.message.match(/at (\d+)/i);
    return {
      ok: false,
      error: err.message,
      position: positionMatch ? parseInt(positionMatch[1], 10) : null,
    };
  }
};
```

**Return shapes:**

```javascript
// Success
{ ok: true, data: <parsed value>, raw: <trimmed string> }

// Failure
{ ok: false, error: <string>, position: <number | null> }
```

**Why `ok` instead of throwing:**
Callers use `if (!result.ok)` rather than try/catch. One error handling strategy throughout the codebase.

**Position extraction:**
Browser error messages differ. Chrome: `"Unexpected token h at position 0"`. Safari: `"Unexpected identifier 'hello'"`. Two regex patterns cover both. Position is `null` when neither matches — used in a future day to highlight the error location.

---

### `renderer.js`

**Responsibility:** Convert parsed JSON data into DOM nodes.
Maintains its own collapse state via closure. No knowledge of toasts, status bar, or application state.

---

#### `createRenderer()`

Factory function. Returns a renderer instance with private state.

```javascript
const createRenderer = () => {
  const collapsedPaths = new Set(); // private — not accessible outside

  // ... private helpers ...

  return { render, collapseToDepth, clearCollapsed }; // public API
};
```

**Why a factory instead of plain functions:**
`collapsedPaths` needs to persist between renders but must not be global. A factory closure gives it a private home. Multiple renderer instances would each have independent collapse state — useful for the diff mode coming on Day 16.

---

#### Private helpers

| Function                       | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `getIndentStyle(depth)`        | Returns `"padding-left: Npx"` inline style string     |
| `createChevron()`              | Builds SVG chevron element via `createElementNS`      |
| `createSpan(className, text)`  | Creates a `<span>` with class and textContent         |
| `getValueClass(type, value)`   | Returns CSS class string for a given type/value       |
| `formatValue(type, value)`     | Returns display string (adds quotes to strings, etc.) |
| `buildClosingRow(type, depth)` | Builds `}` or `]` row at correct indent               |

**`createChevron` uses `createElementNS`:**
SVG elements require the SVG namespace. `document.createElement('svg')` creates an HTMLElement that does not render as SVG. `document.createElementNS('http://www.w3.org/2000/svg', 'svg')` creates a real SVG element.

**`getValueClass` boolean handling:**

```javascript
if (type === 'boolean') {
  return value
    ? 'tree-row__value value--boolean-true'
    : 'tree-row__value value--boolean-false';
}
```

`true` and `false` get distinct classes because they have distinct colors (green vs red).

---

#### `buildRow(key, value, depth, path, onToggle, onSelect)`

Builds one tree row element. The most complex function in the codebase.

**Parameters:**

| Param      | Type       | Description                                     |
| ---------- | ---------- | ----------------------------------------------- |
| `key`      | `string`   | Property name. Empty string for root node       |
| `value`    | `any`      | The JSON value at this node                     |
| `depth`    | `number`   | Nesting level (0 = root)                        |
| `path`     | `string`   | Dot-notation path: `"address.geo.lat"`          |
| `onToggle` | `function` | Called with `(path)` when chevron is clicked    |
| `onSelect` | `function` | Called with `(path, rowEl)` when row is clicked |

**Row anatomy:**

```text
[ toggle/placeholder ][ key ][ : ][ value ][ type-badge ]
```

- Toggle: chevron SVG on objects/arrays, empty placeholder span on primitives
- Key: only rendered when `key !== ''` (root node has no key)
- Colon: only rendered when key is rendered
- Value: bracket for objects/arrays, formatted primitive for leaves
- Type badge: right-aligned, `opacity: 0` by default, `opacity: 1` on row hover

**Collapsed branch display:**

```text
▶  "address"  :  {  3 keys  }
```

Three spans: open bracket + count badge + close bracket.

**Expanded branch display:**

```json
▼  "address"  :  {
     "city"  :  "Portland"
     ...
   }
```

One span: open bracket only. Children render on lines below. Closing row appended after children.

**`e.stopPropagation()` on toggle click:**
Prevents the toggle click from bubbling to the row's click handler (which copies the path). Toggle clicks expand/collapse — they should not also copy.

---

#### `render(container, data, onSelect)`

The public render function. Clears the container and rebuilds the full tree.

```javascript
const render = (container, data, onSelect) => {
  container.innerHTML = '';

  const renderNode = (key, value, depth, path) => {
    // ... builds row, recurses into children, appends closing row
  };

  renderNode('', data, 0, '');
};
```

**`container.innerHTML = ''`:**
Full clear before re-render. Simple and correct. Performance optimization comes on Day 18.

**`renderNode` is defined inside `render`:**
Closes over `container`, `data`, and `onSelect` — three values that every recursive call needs but that do not change. This avoids passing them as parameters through every level of recursion.

**Path construction:**

```javascript
// Objects: dot notation
const childPath = path ? `${path}.${childKey}` : childKey;
// → 'address', 'address.city', 'address.geo.lat'

// Arrays: bracket notation
const childPath = `${path}[${index}]`;
// → 'orders[0]', 'orders[0].id'
```

The ternary on object paths handles the root: when `path` is `''`, the first level becomes `'address'` not `'.address'`.

**Recursion base cases (when `renderNode` does NOT recurse):**

```javascript
if (!isBranch || isCollapsed) return;
```

1. Node is a primitive — nothing to expand
2. Node is collapsed — children exist but should not render

---

#### Public API

| Method                              | Parameters                 | Description                                               |
| ----------------------------------- | -------------------------- | --------------------------------------------------------- |
| `render(container, data, onSelect)` | HTMLElement, any, function | Clears and rebuilds tree                                  |
| `collapseToDepth(data, maxDepth)`   | any, number                | Collapses all nodes beyond `maxDepth`                     |
| `clearCollapsed()`                  | —                          | Clears all collapsed state (used when new JSON is parsed) |

---

### `main.js`

**Responsibility:** Entry point. Wires everything together. Owns DOM refs, application state, event listeners, and UI helper functions.

---

#### Application State

```javascript
let currentData = null; // last successfully parsed JSON value
let currentRaw = ''; // last successfully parsed JSON string
let toastTimer = null; // setTimeout ID for toast auto-dismiss
```

Three variables. `currentData` and `currentRaw` are `null`/empty on load, populated on successful parse, reset on clear. `toastTimer` is managed by `showToast` — stored so a second toast can cancel the first timer.

---

#### ELEMENTS Object

```javascript
const ELEMENTS = {
  input: document.getElementById('json-input'),
  treeContainer: document.getElementById('tree-container'),
  emptyState: document.getElementById('empty-state'),
  errorStrip: document.getElementById('error-strip'),
  errorMessage: document.getElementById('error-message'),
  btnFormat: document.getElementById('btn-format'),
  btnCopyRaw: document.getElementById('btn-copy-raw'),
  btnClear: document.getElementById('btn-clear'),
  btnErrorClose: document.getElementById('btn-error-close'),
  statusNodes: document.getElementById('status-nodes'),
  statusDepth: document.getElementById('status-depth'),
  statusSize: document.getElementById('status-size'),
  statusPath: document.getElementById('status-path'),
  toast: document.getElementById('toast'),
  toastLabel: document.getElementById('toast-label'),
  toastValue: document.getElementById('toast-value'),
  themeToggle: document.querySelector('.theme-toggle'),
  iconMoon: document.querySelector('.icon--moon'),
  iconSun: document.querySelector('.icon--sun'),
  modeBtns: document.querySelectorAll('.mode-toggle__item'),
};
```

All DOM queries happen once at startup. The rest of the code uses `ELEMENTS.*` — never calls `getElementById` or `querySelector` again. Validated at startup: a `console.error` fires if any element is `null`.

---

#### UI Helper Functions

| Function                  | What it does                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| `showError(message)`      | Shows error strip with message text                                   |
| `hideError()`             | Hides error strip, clears message                                     |
| `showTree()`              | Hides empty state, shows tree container                               |
| `showEmptyState()`        | Shows empty state, hides tree container                               |
| `updateStatus(data, raw)` | Updates all three status chips, makes them visible                    |
| `clearStatus()`           | Hides all status chips including path chip                            |
| `showPathInStatus(path)`  | Sets and shows the path chip in status bar                            |
| `showToast(label, value)` | Shows toast with label + monospace value, auto-dismisses after 2500ms |

**`showTree` / `showEmptyState` are mutually exclusive.** One hides what the other shows. This enforces a rule: exactly one of these views is visible at any time.

**`showToast` manages its own timer:**

```javascript
const showToast = (label, value) => {
  // ... set content, show ...
  clearTimeout(toastTimer); // cancel previous if still showing
  toastTimer = setTimeout(() => {
    ELEMENTS.toast.classList.remove('toast--visible');
    setTimeout(() => {
      ELEMENTS.toast.hidden = true;
    }, 200); // wait for CSS transition
  }, 2500);
};
```

The inner `setTimeout` (200ms) waits for the CSS opacity transition to finish before hiding the element. If you set `hidden = true` immediately, the element disappears before the fade-out animation completes.

---

#### `parseAndRender()`

The central function. Three execution paths:

```javascript
const parseAndRender = () => {
  const input = ELEMENTS.input.value;

  // Path 1: empty input
  if (!input.trim()) {
    currentData = null;
    currentRaw = '';
    showEmptyState();
    hideError();
    clearStatus();
    return;
  }

  // Path 2: parse failure
  const result = parseJSON(input);
  if (!result.ok) {
    showError(result.error);
    showEmptyState();
    clearStatus();
    return;
  }

  // Path 3: success
  hideError();
  currentData = result.data;
  currentRaw = result.raw;
  renderer.clearCollapsed();
  renderer.render(ELEMENTS.treeContainer, currentData, path => {
    showPathInStatus(path);
    copyToClipboard(path || '(root)').then(success => {
      if (success) showToast('Path copied', path || '(root)');
    });
  });
  showTree();
  updateStatus(currentData, currentRaw);
};
```

The `onSelect` callback passed to `renderer.render` is the bridge back to the UI layer. The renderer calls it with the clicked path — `main.js` handles what happens next (copy + toast). The renderer knows nothing about toasts or the status bar.

---

#### Event Listeners

| Element              | Event       | Handler                                              |
| -------------------- | ----------- | ---------------------------------------------------- |
| `#json-input`        | `input`     | `debouncedParse` (400ms debounce)                    |
| `#btn-format`        | `click`     | `formatJSON` → set value → `parseAndRender()`        |
| `#btn-copy-raw`      | `click`     | `copyToClipboard(input.value)` → `showToast`         |
| `#btn-clear`         | `click`     | Reset state + DOM + focus textarea                   |
| `#btn-error-close`   | `click`     | `hideError()`                                        |
| `.theme-toggle`      | `click`     | Toggle `data-theme` on `<html>`, swap sun/moon icons |
| `.mode-toggle__item` | `click`     | Update active class + aria-selected                  |
| `document`           | `keydown`   | Handle all keyboard shortcuts                        |
| `#pane-divider`      | `mousedown` | Start drag resize                                    |
| `document`           | `mousemove` | Update pane width during drag                        |
| `document`           | `mouseup`   | End drag resize                                      |

**Why format button calls `parseAndRender()` after setting value:**
Setting `element.value` programmatically does not fire the `input` event. Without the explicit call, the textarea would show formatted JSON but the tree would not update.

**Why mode toggle calls `.click()` not the underlying function:**
Keyboard shortcut handlers call `.click()` on their corresponding button. This keeps one code path — pressing the shortcut is identical to clicking the button. No duplicate logic.

---

#### Keyboard Shortcuts

```javascript
document.addEventListener('keydown', e => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
  // ...
});
```

Listener is on `document` — fires regardless of which element has focus.

| Shortcut               | Action               |
| ---------------------- | -------------------- |
| `⌘↵` / `Ctrl+Enter`    | Parse                |
| `⌘⇧F` / `Ctrl+Shift+F` | Format               |
| `⌘⇧L` / `Ctrl+Shift+L` | Toggle theme         |
| `Escape`               | Clear node selection |

`e.preventDefault()` on `⌘Enter` stops the browser inserting a newline before parsing.

---

#### Pane Resizer (IIFE)

```javascript
(() => {
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  // mousedown / mousemove / mouseup handlers
})();
```

Wrapped in an IIFE so `isDragging`, `startX`, `startWidth` are scoped privately. They do not pollute the module-level scope of `main.js`.

**Three-event drag pattern:**

- `mousedown` on divider → record start position and start width
- `mousemove` on document → compute delta, clamp, apply width
- `mouseup` on document → end drag, restore cursor

`mousemove` and `mouseup` on `document` (not the divider) because fast mouse movement can leave the divider element — document-level listeners catch the events regardless.

Width is clamped: minimum 180px for input pane, maximum `workspaceWidth - 280px` to ensure output pane always has at least 280px.

---

#### Init

```javascript
ELEMENTS.input.value = DEMO_JSON;
parseAndRender();
```

Last two lines. Sets the demo JSON and immediately parses it. The app is never in an unrendered state on first load.

---

### `main.css`

**Responsibility:** All visual styling. Design tokens as CSS custom properties, layout, component styles.

---

#### CSS Custom Properties (`:root`)

Defined in `:root` — available on every element.

**Backgrounds:**

```css
--bg-base: #0d0d10 /* page background */ --bg-surface: #111115
  /* pane backgrounds */ --bg-surface-raised: #1a1a20
  /* chips, buttons, tooltips */ --bg-row-hover: #ffffff08 /* tree row hover */
  --bg-row-selected: #7c3aed18 /* selected tree row */;
```

**Borders:**

```css
--border-subtle: #ffffff0a /* pane divider, status bar border */
  --border-default: #ffffff14 /* chip borders, button borders */
  --border-focus: #7c3aed /* input pane focus ring */;
```

**Text:**

```css
--text-primary: #e8e8ed /* wordmark, main labels */ --text-secondary: #98989f
  /* textarea content, inactive labels */ --text-tertiary: #636369
  /* chips, brackets, type badges */ --text-muted: #3a3a3f
  /* placeholders, disabled */;
```

**Accent (violet):**

```css
--accent: #8b5cf6 /* active mode label, focus states */
  --accent-subtle: #7c3aed22 /* active mode pill background */
  --accent-border: #7c3aed /* focus ring, selected row border */;
```

**JSON syntax colors:**

```css
--json-key: #c4c4cc /* key names — brightest, reads first */
  --json-string: #a78bfa /* string values — soft violet */
  --json-number: #34d399 /* number values — muted emerald */
  --json-bool-true: #34d399 /* true — same as number */
  --json-bool-false: #f87171 /* false — muted red */ --json-null: #636369
  /* null — tertiary gray, recedes */ --json-bracket: #4b4b55
  /* { } [ ] — very muted, structural */ --json-colon: #4b4b55
  /* : separator — same as bracket */;
```

**Sizing:**

```css
--header-height: 40px --statusbar-height: 28px --tree-row-height: 28px
  --tree-indent: 20px;
```

---

#### Layout System

Body uses CSS Grid with named areas:

```css
body {
  display: grid;
  grid-template-rows: var(--header-height) 1fr var(--statusbar-height);
  grid-template-areas:
    'header'
    'workspace'
    'statusbar';
}
```

Workspace uses Flexbox for the two-pane split:

```css
.workspace {
  display: flex;
}
.pane--input {
  width: 35%;
  min-width: 200px;
  flex-shrink: 0;
}
.pane--output {
  flex: 1;
  overflow-y: auto;
}
.pane-divider {
  width: 1px;
  cursor: col-resize;
}
```

---

#### Key CSS Patterns

**`[hidden]` utility:**

```css
[hidden] {
  display: none !important;
}
```

The `!important` overrides any other `display` property. `element.hidden = true` always hides regardless of other styles.

**Toolbar reveal on hover:**

```css
.pane__toolbar {
  opacity: 0;
  transition: opacity 150ms ease;
}
.pane--input:hover .pane__toolbar,
.pane--input:focus-within .pane__toolbar {
  opacity: 1;
}
```

`:focus-within` ensures the toolbar stays visible when a toolbar button is focused (e.g. via keyboard navigation).

**Type badge reveal:**

```css
.tree-row__type {
  opacity: 0;
  transition: opacity 100ms ease;
}
.tree-row:hover .tree-row__type {
  opacity: 1;
}
```

**Selected row left border:**

```css
.tree-row--selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-border);
}
```

Uses a pseudo-element so the border does not affect layout (no width shift).

**Toast animation:**

```css
.toast {
  transform: translateX(-50%) translateY(8px);
  opacity: 0;
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.toast--visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

Combines fade and upward slide. The `translateX(-50%)` keeps it horizontally centered — both states need it or the element shifts on show.

---

### `index.html`

**Responsibility:** HTML structure, element IDs, semantic markup, accessibility attributes, script/style loading.

---

#### Key Structural Elements

| ID                | Element      | Purpose                      |
| ----------------- | ------------ | ---------------------------- |
| `json-input`      | `<textarea>` | Raw JSON input               |
| `tree-container`  | `<div>`      | Tree rows are appended here  |
| `empty-state`     | `<div>`      | Shown when no JSON is parsed |
| `error-strip`     | `<div>`      | Parse error message bar      |
| `error-message`   | `<span>`     | Error text content           |
| `btn-format`      | `<button>`   | Format JSON                  |
| `btn-copy-raw`    | `<button>`   | Copy raw input               |
| `btn-clear`       | `<button>`   | Clear input and tree         |
| `btn-error-close` | `<button>`   | Dismiss error strip          |
| `status-nodes`    | `<span>`     | Node count chip              |
| `status-depth`    | `<span>`     | Depth chip                   |
| `status-size`     | `<span>`     | Size chip                    |
| `status-path`     | `<span>`     | Copied path chip             |
| `toast`           | `<div>`      | Toast notification           |
| `toast-label`     | `<span>`     | Toast label line             |
| `toast-value`     | `<span>`     | Toast monospace value line   |
| `pane-divider`    | `<div>`      | Draggable resize handle      |

---

#### Accessibility Attributes Used

| Attribute            | Where              | Purpose                                 |
| -------------------- | ------------------ | --------------------------------------- |
| `role="main"`        | workspace `<main>` | Landmark for screen readers             |
| `role="tablist"`     | mode toggle        | Identifies tab group                    |
| `role="tab"`         | mode buttons       | Identifies individual tabs              |
| `aria-selected`      | mode buttons       | Current active tab state                |
| `role="tree"`        | tree container     | ARIA tree widget role                   |
| `role="treeitem"`    | each tree row      | ARIA tree node role                     |
| `aria-expanded`      | branch rows        | Expanded/collapsed state                |
| `role="alert"`       | error strip        | Announced by screen readers immediately |
| `aria-live="polite"` | toast              | Announced when user is not busy         |
| `role="contentinfo"` | status bar footer  | Landmark for page metadata              |
| `role="separator"`   | pane divider       | Identifies resize handle                |

---

#### Script Loading Order

```html
<script src="js/utils.js"></script>
<!-- 1st: defines globals used by all -->
<script src="js/parser.js"></script>
<!-- 2nd: uses getType from utils -->
<script src="js/renderer.js"></script>
<!-- 3rd: uses getType from utils -->
<script src="js/main.js"></script>
<!-- 4th: uses everything -->
```

Scripts are at the end of `<body>` — the DOM is fully parsed before any script runs, avoiding the need for `DOMContentLoaded`.

---

## Design Tokens

Complete token reference. All values are CSS custom properties defined in `:root`.

### Color Hierarchy (Dark Theme)

```
Backgrounds (darkest to lightest):
  --bg-base           #0d0d10   page
  --bg-surface        #111115   panes
  --bg-surface-raised #1a1a20   chips, buttons

Text (brightest to dimmest):
  --text-primary      #e8e8ed   labels, wordmark
  --text-secondary    #98989f   textarea, inactive labels
  --text-tertiary     #636369   chips, badges, brackets
  --text-muted        #3a3a3f   placeholders

JSON values (visual hierarchy):
  --json-key          #c4c4cc   reads first (brightest)
  --json-string       #a78bfa   reads second (colored)
  --json-number       #34d399   reads second (colored)
  --json-bool-true    #34d399   same as number
  --json-bool-false   #f87171   red — communicates negation
  --json-null         #636369   recedes — null is absence of value
  --json-bracket      #4b4b55   recedes — structural, not semantic
```

---

## State Management

### Application State (`main.js`)

```
currentData: any | null
  - null on load
  - Set to parsed data on successful parse
  - Reset to null on clear or empty input

currentRaw: string
  - '' on load
  - Set to trimmed input string on successful parse
  - Reset to '' on clear or empty input

toastTimer: number | null
  - null when no toast is showing
  - setTimeout ID while toast is auto-dismiss pending
  - Cleared and reset if a second toast fires
```

### Collapse State (`renderer.js` — private)

```
collapsedPaths: Set<string>
  - Empty on createRenderer() call
  - Paths added on collapse click
  - Paths removed on expand click
  - Fully cleared via clearCollapsed() when new JSON is parsed
  - Persists across re-renders (intentional — collapse state survives typing)
```

---

## Event System

### Event Flow Diagram

```
DOM Events → Listeners in main.js → Functions in main.js
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                         parseJSON    renderer     utils fns
                         (parser.js)  (renderer)   (utils.js)
                                          │
                              Renderer fires callbacks
                                          │
                                          ▼
                                   Back to main.js
                                 (showToast, updateStatus)
```

The renderer communicates back to `main.js` exclusively through the `onSelect` callback. This keeps the renderer decoupled — it fires the callback and does not care what happens next.

---

## Keyboard Shortcuts

| Keys (Mac) | Keys (Win/Linux) | Action          | `preventDefault` |
| ---------- | ---------------- | --------------- | ---------------- |
| `⌘↵`       | `Ctrl+Enter`     | Parse JSON      | Yes              |
| `⌘⇧F`      | `Ctrl+Shift+F`   | Format JSON     | Yes              |
| `⌘⇧L`      | `Ctrl+Shift+L`   | Toggle theme    | Yes              |
| `Escape`   | `Escape`         | Clear selection | No               |

---

## Known Limitations

**Day 8 — deliberately deferred:**

| Limitation                                        | Planned fix                  | Day         |
| ------------------------------------------------- | ---------------------------- | ----------- |
| Full re-render on every collapse/expand           | Targeted DOM updates         | 18          |
| No ES modules — global scope pollution            | `import`/`export` refactor   | 19          |
| `MAX_COUNT`/constants duplicated across files     | Shared module constants      | 19          |
| No URL loading                                    | `fetch` + loading states     | 9           |
| No search/filtering                               | Real-time search             | 11          |
| No path copy on keyboard                          | Arrow key + Enter navigation | 13          |
| No localStorage persistence                       | Save last JSON + theme       | 19          |
| Diff mode is a stub                               | Full diff algorithm          | 16          |
| No mobile layout                                  | Responsive breakpoints       | 24          |
| Array indices shown as string keys (`"0"`, `"1"`) | Display as `[0]`, `[1]`      | Polish pass |

---

## Roadmap

### Week 2 (Days 8–14) — Core Explorer

| Day  | Feature                                                   |
| ---- | --------------------------------------------------------- |
| 8 ✅ | Project setup, parser, basic tree render                  |
| 9    | Load JSON from URL via `fetch` + loading states           |
| 10   | Advanced collapse/expand, click-to-expand anywhere on row |
| 11   | Real-time search — filter tree, highlight matches         |
| 12   | Copy path improvements + utils module cleanup             |
| 13   | Keyboard navigation + accessibility audit                 |
| 14   | Deploy Lexicon v1 to GitHub Pages                         |

### Week 3 (Days 15–21) — Diff Mode + Architecture

| Day | Feature                                                |
| --- | ------------------------------------------------------ |
| 15  | Closure/state deep dive — refactor collapse state      |
| 16  | Diff mode — basic structural comparison                |
| 17  | Visual diff highlighting (green/red/amber)             |
| 18  | Performance — handle large JSON without full re-render |
| 19  | ES modules refactor — `import`/`export`                |
| 20  | localStorage persistence — save last JSON + theme      |
| 21  | Export options — copy formatted, download as file      |

### Week 4 (Days 22–28) — Polish + Portfolio

| Day   | Feature                                                  |
| ----- | -------------------------------------------------------- |
| 22–23 | Drag to compare two JSON files, history of recent inputs |
| 24    | Responsive layout + mobile single-pane mode              |
| 25    | Accessibility audit + keyboard power-user mode           |
| 26    | Manual test suite                                        |
| 27    | README + case study writing                              |
| 28    | Final deploy + reflection                                |

---

## Debugging Reference

### Console Errors and Causes

| Error                                                         | Cause                                                   | Fix                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| `GET file:///…/src/utils.js net::ERR_FILE_NOT_FOUND`          | Script path in HTML doesn't match actual directory name | Change `src/` to `js/` in script tags          |
| `Lexicon init failed: element "X" not found`                  | ID in JS doesn't match ID in HTML                       | Check both for typos                           |
| `Cannot read properties of null (reading 'addEventListener')` | querySelector returned null                             | Element doesn't exist or script ran before DOM |
| `Unexpected token X at position N`                            | Invalid JSON in textarea                                | Normal — shown in error strip                  |
| `Math.max() returned -Infinity for depth`                     | `getDepth` called on empty object/array                 | Fixed — empty check before `Math.max` call     |

### Useful Console Commands

```javascript
// Check current parsed data
currentData;

// Check current collapse state
// (not directly accessible — by design)
// Re-render to see state reflected in DOM

// Check node count manually
countNodes(currentData);

// Check depth manually
getDepth(currentData);

// Test the parser directly
parseJSON('{"a": 1}');
parseJSON('not json');
parseJSON('');

// Test getType
getType(null); // 'null'
getType([]); // 'array'
getType({}); // 'object'
```

### Common Debugging Steps

**Tree not updating after typing:**

1. Check console for 404 errors (script paths wrong)
2. Check if `debouncedParse` is attached to the input event
3. Check if `parseAndRender` reaches `renderer.render` (add `console.log`)

**Collapse not working:**

1. Check if `onToggle` is being called (`console.log` inside it)
2. Check if `collapsedPaths.add/delete` is running
3. Check if `render` is called after the toggle

**Styles not matching design:**

1. Check if `styles/main.css` path is correct in `<link>` tag
2. Open Elements panel → check computed styles on the element
3. Check if `:root` variables are defined (inspect `html` element in DevTools)

---
