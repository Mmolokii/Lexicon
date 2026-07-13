// search.js
// Responsible for all search logic.
// No DOM access except for applying/removing classes to tree rows.
// Takes a query string and the rendered tree container,
// applies visual state to rows, and returns match metadata.

/**
 * Escapes special regex characters in a string.
 * Needed because the user's search query is treated as a literal
 * string, not a regex pattern.
 */
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Given a dot-notation path like "address.geo.lat",
 * returns all ancestor paths:
 * ["address", "address.geo"]
 *
 * Used to identify which rows need to stay visible
 * even though they do not directly match the query.
 */
const getAncestorPaths = path => {
  const ancestors = [];
  const parts = path.split('.');

  // Handle array bracket notation: "orders[0].id"
  // We need to split on both . and [ correctly
  // Simple approach: rebuild the path segment by segment
  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}.${parts[i]}` : parts[i];
    ancestors.push(current);
  }

  return ancestors;
};

/**
 * Walks a parsed JSON value and collects every path whose
 * key name or string value matches the query.
 *
 * Returns a Set of matching paths.
 *
 * @param {*}      data   — the parsed JSON value
 * @param {RegExp} regex  — compiled from the search query
 * @param {string} path   — current path (empty string for root)
 */
const collectMatchingPaths = (data, regex, path = '') => {
  const matches = new Set();
  const type = getType(data);

  if (type === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;

      // Does the key name match?
      if (regex.test(key)) {
        matches.add(childPath);
      }

      // Does the value match (for primitives)?
      const childType = getType(value);
      if (childType !== 'object' && childType !== 'array') {
        const valueStr = value === null ? 'null' : String(value);
        if (regex.test(valueStr)) {
          matches.add(childPath);
        }
      }

      // Recurse into objects and arrays
      if (childType === 'object' || childType === 'array') {
        const childMatches = collectMatchingPaths(value, regex, childPath);
        childMatches.forEach(m => matches.add(m));
      }
    });
  } else if (type === 'array') {
    data.forEach((value, index) => {
      const childPath = `${path}[${index}]`;
      const childType = getType(value);

      if (childType !== 'object' && childType !== 'array') {
        const valueStr = value === null ? 'null' : String(value);
        if (regex.test(valueStr)) {
          matches.add(childPath);
        }
      }

      if (childType === 'object' || childType === 'array') {
        const childMatches = collectMatchingPaths(value, regex, childPath);
        childMatches.forEach(m => matches.add(m));
      }
    });
  }

  return matches;
};

/**
 * Wraps occurrences of the query string within a text node
 * with <mark class="search-highlight"> spans.
 *
 * Operates on a DOM element's child text nodes directly —
 * does not use innerHTML to avoid XSS risk.
 *
 * Returns the element with highlights applied.
 */
const highlightMatches = (element, regex) => {
  // Walk child nodes looking for text nodes to highlight
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    if (!regex.test(text)) return;

    // Reset regex lastIndex after the test (regex has /g flag)
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      // The match itself — wrapped in a mark element
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = match[0];
      fragment.appendChild(mark);

      lastIndex = regex.lastIndex;

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) regex.lastIndex++;
    }

    // Text after the last match
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });

  // Reset regex state for reuse
  regex.lastIndex = 0;
};

/**
 * Removes all search highlight marks from the container,
 * restoring plain text nodes.
 */
const clearHighlights = container => {
  container.querySelectorAll('.search-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize(); // merge adjacent text nodes
  });
};

/**
 * Main search function. Call this on every keystroke (debounced).
 *
 * @param {string}      query     — the search string
 * @param {*}           data      — the parsed JSON value
 * @param {HTMLElement} container — the tree-container element
 *
 * @returns {{ matchCount: number, totalRows: number }}
 */
const applySearch = (query, data, container) => {
  // Clear previous highlights before anything else
  clearHighlights(container);

  const rows = Array.from(container.querySelectorAll('.tree-row'));

  // Remove all search classes from previous run
  rows.forEach(row => {
    row.classList.remove(
      'tree-row--matched',
      'tree-row--dimmed',
      'tree-row--ancestor'
    );
  });

  // Empty query — restore everything to full opacity and return
  if (!query.trim()) {
    return { matchCount: 0, totalRows: rows.length };
  }

  // Compile the regex once — case insensitive, global for exec loop
  let regex;
  try {
    regex = new RegExp(escapeRegex(query), 'gi');
  } catch {
    return { matchCount: 0, totalRows: rows.length };
  }

  // Find all matching paths by walking the data
  const matchingPaths = collectMatchingPaths(data, regex);

  if (matchingPaths.size === 0) {
    // No matches — dim everything
    rows.forEach(row => row.classList.add('tree-row--dimmed'));
    return { matchCount: 0, totalRows: rows.length };
  }

  // Build the set of ancestor paths that should stay visible
  const ancestorPaths = new Set();
  matchingPaths.forEach(path => {
    getAncestorPaths(path).forEach(ancestor => ancestorPaths.add(ancestor));
  });

  // Apply classes to each row
  rows.forEach(row => {
    const path = row.dataset.path;

    if (matchingPaths.has(path)) {
      row.classList.add('tree-row--matched');

      // Apply substring highlighting
      // Reset regex before each use (stateful due to /g flag)
      regex.lastIndex = 0;
      highlightMatches(row, regex);
    } else if (ancestorPaths.has(path) || path === '') {
      // Ancestor rows stay visible so you can see where matches live
      // path === '' handles the root row
      row.classList.add('tree-row--ancestor');
    } else {
      row.classList.add('tree-row--dimmed');
    }
  });

  return {
    matchCount: matchingPaths.size,
    totalRows: rows.length,
  };
};

/**
 * Collects all paths that have matches AND are currently inside
 * collapsed nodes — i.e. matches the user cannot see.
 *
 * Returns a Set of paths that need to be expanded so matches
 * become visible.
 *
 * Called by main.js before render — expands the necessary paths
 * in the renderer's collapsedPaths before triggering a re-render.
 */
const getPathsToExpand = (query, data) => {
  if (!query.trim()) return new Set();

  let regex;
  try {
    regex = new RegExp(escapeRegex(query), 'gi');
  } catch {
    return new Set();
  }

  const matchingPaths = collectMatchingPaths(data, regex);
  const toExpand = new Set();

  matchingPaths.forEach(path => {
    getAncestorPaths(path).forEach(ancestor => toExpand.add(ancestor));
  });

  return toExpand;
};
