let currentData = null;
let currentRaw = '';
let toastTimer = null;

// DOM refs
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
  pane: document.querySelector('.pane--input'),
  paneOutput: document.querySelector('.pane--output'),
  divider: document.getElementById('pane-divider'),
};

// Validate all elements exist
Object.entries(ELEMENTS).forEach(([name, el]) => {
  // NodeLists from querySelectorAll are valid even if empty
  if (el === null) {
    console.error(`Lexicon init failed: element "${name}" not found.`);
  }
});

// Renderer instance
const renderer = createRenderer();

// UI helpers

const showError = message => {
  ELEMENTS.errorMessage.textContent = message;
  ELEMENTS.errorStrip.hidden = false;
};

const hideError = () => {
  ELEMENTS.errorStrip.hidden = true;
  ELEMENTS.errorMessage.textContent = '';
};

const showTree = () => {
  ELEMENTS.emptyState.hidden = true;
  ELEMENTS.treeContainer.hidden = false;
};

const showEmptyState = () => {
  ELEMENTS.emptyState.hidden = false;
  ELEMENTS.treeContainer.hidden = true;
};

const updateStatus = (data, raw) => {
  const nodes = countNodes(data);
  const depth = getDepth(data);
  const size = getSize(raw);

  ELEMENTS.statusNodes.textContent = `${nodes} node${nodes !== 1 ? 's' : ''}`;
  ELEMENTS.statusDepth.textContent = `depth: ${depth}`;
  ELEMENTS.statusSize.textContent = size;

  ELEMENTS.statusNodes.hidden = false;
  ELEMENTS.statusDepth.hidden = false;
  ELEMENTS.statusSize.hidden = false;
};

const clearStatus = () => {
  ELEMENTS.statusNodes.hidden = true;
  ELEMENTS.statusDepth.hidden = true;
  ELEMENTS.statusSize.hidden = true;
  ELEMENTS.statusPath.hidden = true;
};

const showPathInStatus = path => {
  const display = path || '(root)';
  ELEMENTS.statusPath.textContent = display;
  ELEMENTS.statusPath.hidden = false;
};

const showToast = (label, value) => {
  ELEMENTS.toastLabel.textContent = label;
  ELEMENTS.toastValue.textContent = value;
  ELEMENTS.toast.hidden = false;

  // Force reflow so transition plays
  void ELEMENTS.toast.offsetHeight;
  ELEMENTS.toast.classList.add('toast--visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ELEMENTS.toast.classList.remove('toast--visible');
    setTimeout(() => {
      ELEMENTS.toast.hidden = true;
    }, 200);
  }, 2500);
};

// Core: parse and render
const parseAndRender = () => {
  const input = ELEMENTS.input.value;

  // Empty input — reset to empty state
  if (!input.trim()) {
    currentData = null;
    currentRaw = '';
    showEmptyState();
    hideError();
    clearStatus();
    return;
  }

  const result = parseJSON(input);

  if (!result.ok) {
    showError(result.error);
    showEmptyState();
    clearStatus();
    return;
  }

  // Success
  hideError();
  currentData = result.data;
  currentRaw = result.raw;

  renderer.clearCollapsed();

  renderer.render(ELEMENTS.treeContainer, currentData, path => {
    showPathInStatus(path);
    copyToClipboard(path || '(root)').then(success => {
      if (success) {
        showToast('Path copied', path || '(root)');
      }
    });
  });

  showTree();
  updateStatus(currentData, currentRaw);
};

// Event listeners

// Parse on input (debounced — 400ms after user stops typing)
const debouncedParse = debounce(parseAndRender, 400);
ELEMENTS.input.addEventListener('input', debouncedParse);

// Format button
ELEMENTS.btnFormat.addEventListener('click', () => {
  const formatted = formatJSON(ELEMENTS.input.value);
  if (formatted) {
    ELEMENTS.input.value = formatted;
    parseAndRender();
  } else {
    showError('Cannot format — JSON is not valid');
  }
});

// Copy raw JSON button
ELEMENTS.btnCopyRaw.addEventListener('click', async () => {
  const raw = ELEMENTS.input.value;
  if (!raw.trim()) return;
  const success = await copyToClipboard(raw);
  if (success) showToast('Copied', 'Raw JSON copied to clipboard');
});

// Clear button
ELEMENTS.btnClear.addEventListener('click', () => {
  ELEMENTS.input.value = '';
  currentData = null;
  currentRaw = '';
  hideError();
  showEmptyState();
  clearStatus();
  ELEMENTS.input.focus();
});

// Error dismiss
ELEMENTS.btnErrorClose.addEventListener('click', hideError);

// Theme toggle
ELEMENTS.themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  ELEMENTS.iconMoon.style.display = isDark ? 'none' : '';
  ELEMENTS.iconSun.style.display = isDark ? '' : 'none';
});

// Mode toggle (Explorer / Diff — Diff is a stub for now)
ELEMENTS.modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    ELEMENTS.modeBtns.forEach(b => {
      b.classList.remove('mode-toggle__item--active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('mode-toggle__item--active');
    btn.setAttribute('aria-selected', 'true');

    if (btn.dataset.mode === 'diff') {
      showToast('Coming soon', 'Diff mode arrives on Day 16');
    }
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

  // cmd + Enter — Parse
  if (cmdOrCtrl && e.key === 'Enter') {
    e.preventDefault();
    parseAndRender();
    return;
  }

  // cmd + shift + F — Format
  if (cmdOrCtrl && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    ELEMENTS.btnFormat.click();
    return;
  }

  // cmd + shift + L — Toggle theme
  if (cmdOrCtrl && e.shiftKey && e.key === 'L') {
    e.preventDefault();
    ELEMENTS.themeToggle.click();
    return;
  }

  // Escape — clear selection
  if (e.key === 'Escape') {
    ELEMENTS.treeContainer
      .querySelectorAll('.tree-row--selected')
      .forEach(r => r.classList.remove('tree-row--selected'));
    ELEMENTS.statusPath.hidden = true;
  }
});

// ── Pane resizer ─────────────────────────────────────────────

(() => {
  const divider = ELEMENTS.divider;
  const workspace = document.querySelector('.workspace');
  const inputPane = document.querySelector('.pane--input');
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  divider.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX;
    startWidth = inputPane.getBoundingClientRect().width;
    divider.classList.add('pane-divider--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const workspaceWidth = workspace.getBoundingClientRect().width;
    const newWidth = Math.min(
      Math.max(startWidth + delta, 180), // min 180px
      workspaceWidth - 280 // max: leave 280px for output
    );
    inputPane.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('pane-divider--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

// Load demo JSON if textarea is empty — gives something to look at immediately
const DEMO_JSON = `{
  "userId": 4815,
  "username": "kestrel",
  "active": true,
  "verified": false,
  "metadata": null,
  "address": {
    "city": "Portland",
    "state": "OR",
    "zip": "97201",
    "geo": { "lat": 45.5231, "lng": -122.6765 }
  },
  "roles": ["admin", "editor", "viewer"],
  "orders": [
    { "id": "ord_8821", "total": 149.99, "shipped": true },
    { "id": "ord_8822", "total": 39.5, "shipped": false }
  ],
  "lastLogin": "2026-06-21T14:32:00Z"
}`;

ELEMENTS.input.value = DEMO_JSON;
parseAndRender();
