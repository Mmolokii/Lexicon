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
  urlInput: document.getElementById('url-input'),
  btnFetch: document.getElementById('btn-fetch'),
  fetchStatus: document.getElementById('fetch-status'),
  fetchStatusIcon: document.getElementById('fetch-status-icon'),
  fetchStatusText: document.getElementById('fetch-status-text'),
  inputTabs: document.querySelectorAll('.input-tab'),
  panelPaste: document.getElementById('panel-paste'),
  panelUrl: document.getElementById('panel-url'),
  quickUrlBtns: document.querySelectorAll('.quick-url-btn'),
  outputToolbar: document.getElementById('output-toolbar'),
  btnExpandAll: document.getElementById('btn-expand-all'),
  btnCollapseAll: document.getElementById('btn-collapse-all'),
  depthBtns: document.querySelectorAll('.depth-btn'),
};

const onSelectHandler = path => {
  showPathInStatus(path);
  copyToClipboard(path || '(root)').then(success => {
    if (success) showToast('Path copied', path || '(root)');
  });
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

let activeFetchController = null; // AbortController for in-flight fetch

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
  ELEMENTS.outputToolbar.hidden = false;
};

const showEmptyState = () => {
  ELEMENTS.emptyState.hidden = false;
  ELEMENTS.treeContainer.hidden = true;
  ELEMENTS.outputToolbar.hidden = true;
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

const setActiveDepthBtn = depth => {
  ELEMENTS.depthBtns.forEach(btn => {
    btn.classList.toggle(
      'depth-btn--active',
      parseInt(btn.dataset.depth, 10) === depth
    );
  });
};

// Fetch status UI
const showFetchStatus = (state, content) => {
  // state: 'loading' | 'success' | 'error'
  ELEMENTS.fetchStatus.hidden = false;
  ELEMENTS.fetchStatus.className = `fetch-status fetch-status--${state}`;

  if (state === 'loading') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    ELEMENTS.fetchStatusIcon.innerHTML = '';
    ELEMENTS.fetchStatusIcon.appendChild(spinner);
  } else if (state === 'success') {
    ELEMENTS.fetchStatusIcon.textContent = '✓';
  } else {
    ELEMENTS.fetchStatusIcon.textContent = '✗';
  }

  ELEMENTS.fetchStatusText.textContent = content;
};

const hideFetchStatus = () => {
  ELEMENTS.fetchStatus.hidden = true;
};

// Input tab switching
const switchInputTab = tabName => {
  ELEMENTS.inputTabs.forEach(tab => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('input-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  if (tabName === 'paste') {
    ELEMENTS.panelPaste.classList.remove('input-panel--hidden');
    ELEMENTS.panelUrl.classList.add('input-panel--hidden');
  } else {
    ELEMENTS.panelPaste.classList.add('input-panel--hidden');
    ELEMENTS.panelUrl.classList.remove('input-panel--hidden');
    ELEMENTS.urlInput.focus();
  }
};

// URL fetch
const loadFromUrl = async url => {
  if (!url.trim()) return;

  // Cancel any in-flight request
  if (activeFetchController) {
    activeFetchController.abort();
  }

  // Save locally so we can detect if a newer call superseded us
  const controller = new AbortController();
  activeFetchController = controller;

  // UI: loading state
  ELEMENTS.btnFetch.disabled = true;
  ELEMENTS.btnFetch.textContent = 'Loading...';
  showFetchStatus('loading', `Fetching ${url}`);
  hideError();
  showEmptyState();
  clearStatus();

  const result = await fetchJSON(url, controller.signal);

  // A newer request started while we were waiting — bail silently
  // Without this guard, the aborted call's cleanup runs over the
  // newer call's loading state (re-enables button, hides spinner)
  if (activeFetchController !== controller) return;
  activeFetchController = null;

  // UI: reset button
  ELEMENTS.btnFetch.disabled = false;
  ELEMENTS.btnFetch.textContent = 'Load';

  // Intentional cancel — do not update UI
  if (!result.ok && result.type === 'abort') {
    hideFetchStatus();
    return;
  }

  if (!result.ok) {
    showFetchStatus('error', result.error);
    showEmptyState();
    return;
  }

  // Success
  showFetchStatus('success', `Loaded in ${result.duration}ms`);

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

  renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);

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

// Tab switching
ELEMENTS.inputTabs.forEach(tab => {
  tab.addEventListener('click', () => switchInputTab(tab.dataset.tab));
});

// URL fetch
ELEMENTS.btnFetch.addEventListener('click', () => {
  loadFromUrl(ELEMENTS.urlInput.value.trim());
});

// Enter key in URL input triggers fetch
ELEMENTS.urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadFromUrl(ELEMENTS.urlInput.value.trim());
  }
});

// Quick URL buttons
ELEMENTS.quickUrlBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const url = btn.dataset.url;
    ELEMENTS.urlInput.value = url;
    loadFromUrl(url);
  });
});

// Output toolbar
ELEMENTS.btnExpandAll.addEventListener('click', () => {
  if (!currentData) return;
  renderer.expandAll();
  renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
  setActiveDepthBtn(-1); // no depth is active after expand all
});

ELEMENTS.btnCollapseAll.addEventListener('click', () => {
  if (!currentData) return;
  renderer.collapseAll(currentData);
  renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
  setActiveDepthBtn(0);
});

ELEMENTS.depthBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentData) return;
    const depth = parseInt(btn.dataset.depth, 10);
    renderer.clearCollapsed();
    renderer.collapseToDepth(currentData, depth);
    renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
    setActiveDepthBtn(depth);
  });
});

// Tree keyboard navigation
ELEMENTS.treeContainer.addEventListener('keydown', e => {
  if (!currentData) return;
  renderer.handleKeyNav(
    e,
    ELEMENTS.treeContainer,
    currentData,
    onSelectHandler
  );
});

// Focus the tree when clicking the output pane
ELEMENTS.treeContainer.addEventListener('click', () => {
  ELEMENTS.treeContainer.focus({ preventScroll: true });
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

  // cmd + shift + U - switch to URL tab
  if (cmdOrCtrl && e.shiftKey && e.key === 'U') {
    e.preventDefault();
    switchInputTab('url');
    return;
  }

  // cmd + shift + P
  if (cmdOrCtrl && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    switchInputTab('paste');
    return;
  }
});

// Pane resizer

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
