let currentData = null;
let currentRaw = '';
let toastTimer = null;
let isSearchActive = false;
let currentQuery = '';
let contextMenuPath = null; // node path context menu
let shortcutsTrap = null; // focus trap instance for shortcuts overlay

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
  searchBar: document.getElementById('search-bar'),
  searchInput: document.getElementById('search-input'),
  searchCount: document.getElementById('search-count'),
  btnSearchClose: document.getElementById('btn-search-close'),
  contextMenu: document.getElementById('context-menu'),
  contextMenuItems: document.querySelectorAll('.context-menu__item'),
  overlayBackdrop: document.getElementById('overlay-backdrop'),
  shortcutsOverlay: document.getElementById('shortcuts-overlay'),
  btnShortcutsClose: document.getElementById('btn-shortcuts-close'),
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

// Search helpers
const openSearch = () => {
  if (!currentData) return;
  isSearchActive = true;
  ELEMENTS.searchBar.hidden = false;
  ELEMENTS.searchInput.focus();
  ELEMENTS.searchInput.select();
};

const closeSearch = () => {
  isSearchActive = false;
  currentQuery = '';
  ELEMENTS.searchBar.hidden = true;
  ELEMENTS.searchInput.value = '';
  ELEMENTS.searchCount.hidden = true;

  // Clear all search visual state from the tree
  const container = ELEMENTS.treeContainer;
  clearHighlights(container);
  container
    .querySelectorAll(
      '.tree-row--matched, .tree-row--dimmed, .tree-row--ancestor'
    )
    .forEach(row => {
      row.classList.remove(
        'tree-row--matched',
        'tree-row--dimmed',
        'tree-row--ancestor'
      );
    });
};

const runSearch = query => {
  currentQuery = query;

  if (!currentData) return;

  // Before applying search visuals, expand any collapsed ancestors
  // of matching nodes so matches are not hidden inside collapsed branches
  if (query.trim()) {
    const pathsToExpand = getPathsToExpand(query, currentData);
    if (pathsToExpand.size > 0) {
      renderer.expandPaths(pathsToExpand);
      renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
    }
  }

  const { matchCount } = applySearch(
    query,
    currentData,
    ELEMENTS.treeContainer
  );

  // Update match counter
  if (query.trim()) {
    ELEMENTS.searchCount.hidden = false;
    ELEMENTS.searchCount.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
    ELEMENTS.searchCount.classList.toggle(
      'search-bar__count--no-results',
      matchCount === 0
    );
  } else {
    ELEMENTS.searchCount.hidden = true;
  }
};

// Context Menu
const openContextMenu = (x, y, path) => {
  contextMenuPath = path;

  const menu = ELEMENTS.contextMenu;
  menu.hidden = false;

  // Position at cursor, but keep inside the viewport
  const menuRect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - menuRect.width - 8;
  const maxY = window.innerHeight - menuRect.height - 8;

  menu.style.left = `${Math.min(x, maxX)}px`;
  menu.style.top = `${Math.min(y, maxY)}px`;

  // Disable subtree actions on leaf nodes
  const value = getValueAtPath(currentData, path);
  const type = getType(value);
  const isBranch = type === 'object' || type === 'array';

  ELEMENTS.contextMenuItems.forEach(item => {
    const isSubtreeAction =
      item.dataset.action === 'expand-subtree' ||
      item.dataset.action === 'collapse-subtree';
    item.classList.toggle(
      'context-menu__item--disabled',
      isSubtreeAction && !isBranch
    );
  });
};

const closeContextMenu = () => {
  ELEMENTS.contextMenu.hidden = true;
  contextMenuPath = null;
};

const handleContextAction = async action => {
  if (contextMenuPath === null || !currentData) return;

  const path = contextMenuPath;
  const value = getValueAtPath(currentData, path);

  switch (action) {
    case 'copy-path': {
      const success = await copyToClipboard(path || '(root)');
      if (success) showToast('Path copied', path || '(root)');
      break;
    }

    case 'copy-value': {
      // Primitives copy as their string form, no quotes
      const type = getType(value);
      const text =
        type === 'object' || type === 'array'
          ? JSON.stringify(value)
          : String(value);
      const success = await copyToClipboard(text);
      if (success)
        showToast(
          'Value copied',
          text.length > 60 ? `${text.slice(0, 60)}...` : text
        );
      break;
    }

    case 'copy-subtree': {
      const json = JSON.stringify(value, null, 2);
      const success = await copyToClipboard(json);
      if (success) {
        const preview = `${countNodes(value)} nodes`;
        showToast('Subtree copied as JSON', preview);
      }
      break;
    }

    case 'expand-subtree': {
      renderer.expandSubtreeAt(currentData, path);
      renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
      break;
    }

    case 'collapse-subtree': {
      renderer.collapseSubtreeAt(currentData, path);
      renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
      break;
    }
  }

  closeContextMenu();
};

// Shortcuts overlay
const openShortcuts = () => {
  ELEMENTS.overlayBackdrop.hidden = false;
  ELEMENTS.shortcutsOverlay.hidden = false;
  document.body.style.overflow = 'hidden'; // prevent background scroll

  // Create and activate the focus trap
  shortcutsTrap = createFocusTrap(ELEMENTS.shortcutsOverlay);
  shortcutsTrap.activate();
};

const closeShortcuts = () => {
  ELEMENTS.overlayBackdrop.hidden = true;
  ELEMENTS.shortcutsOverlay.hidden = true;
  document.body.style.overflow = '';

  if (shortcutsTrap) {
    shortcutsTrap.deactivate(); // returns focus to previous element
    shortcutsTrap = null;
  }
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

  closeSearch();
  renderer.clearCollapsed();
  renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler); // use named handler
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

  closeSearch();
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

  // ? — open shortcuts overlay
  // Guard: not when typing in an input or textarea
  if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      if (ELEMENTS.shortcutsOverlay.hidden) {
        openShortcuts();
      } else {
        closeShortcuts();
      }
      return;
    }
  }

  // cmd + shift + X — clear input (new shortcut wired to existing clear button)
  if (cmdOrCtrl && e.shiftKey && e.key === 'X') {
    e.preventDefault();
    ELEMENTS.btnClear.click();
    return;
  }

  // Escape — clear selection
  if (e.key === 'Escape') {
    // Close shortcuts overlay first if open
    if (!ELEMENTS.shortcutsOverlay.hidden) {
      closeShortcuts();
      return;
    }

    // Then context menu
    if (!ELEMENTS.contextMenu.hidden) {
      closeContextMenu();
      return;
    }
    // Then search
    if (isSearchActive) {
      closeSearch();
      return;
    }

    // Then clear selection
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

  // cmd + F — open search
  if (cmdOrCtrl && e.key === 'f') {
    e.preventDefault();
    openSearch();
    return;
  }

  // cmd + shift + A — expand all
  if (cmdOrCtrl && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    if (currentData) {
      renderer.expandAll();
      renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
      setActiveDepthBtn(-1);
    }
    return;
  }

  // cmd + shift + 0 — collapse all
  if (cmdOrCtrl && e.shiftKey && e.key === '0') {
    e.preventDefault();
    if (currentData) {
      renderer.collapseAll(currentData);
      renderer.render(ELEMENTS.treeContainer, currentData, onSelectHandler);
      setActiveDepthBtn(0);
    }
    return;
  }
});

// Context menu listeners
// Right-click on a tree row opens the context menu
ELEMENTS.treeContainer.addEventListener('contextmenu', e => {
  const row = e.target.closest('.tree-row');
  if (!row || row.dataset.path === undefined) return;

  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, row.dataset.path);
});

// Menu item clicks
ELEMENTS.contextMenuItems.forEach(item => {
  item.addEventListener('click', () => {
    handleContextAction(item.dataset.action);
  });
});

// Close the menu on any click elsewhere
document.addEventListener('click', e => {
  if (!ELEMENTS.contextMenu.hidden && !e.target.closest('.context-menu')) {
    closeContextMenu();
  }
});

// Close the menu on Escape (add to the existing Escape handler)
// and on scroll
ELEMENTS.treeContainer.addEventListener('scroll', closeContextMenu, {
  passive: true,
});

// Shortcuts overlay listeners
ELEMENTS.btnShortcutsClose.addEventListener('click', closeShortcuts);
ELEMENTS.overlayBackdrop.addEventListener('click', closeShortcuts);

// Search
const debouncedSearch = debounce(query => runSearch(query), 150);

// Tab in search bar moves focus into tree at first matching row
ELEMENTS.searchInput.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.shiftKey) return;

  const firstMatch = ELEMENTS.treeContainer.querySelector('.tree-row--matched');
  if (!firstMatch) return;

  e.preventDefault();
  ELEMENTS.treeContainer.focus({ preventScroll: true });

  // Move the renderer's internal focus to the first match
  const path = firstMatch.dataset.path;
  if (path !== undefined) {
    renderer.setFocusedPath(path, ELEMENTS.treeContainer);
  }
});

ELEMENTS.searchInput.addEventListener('input', e => {
  debouncedSearch(e.target.value);
});

ELEMENTS.btnSearchClose.addEventListener('click', closeSearch);

// Close search when clicking outside the search bar
ELEMENTS.treeContainer.addEventListener('click', () => {
  ELEMENTS.treeContainer.focus({ preventScroll: true });
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
