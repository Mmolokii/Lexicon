const createRenderer = () => {
  // Set of node paths that are currently collapsed.
  // Paths are dot-notation strings: "address", "address.geo", etc.
  const collapsedPaths = new Set();

  // Private helpers

  /**
   * Builds the indent padding style for a given depth.
   */
  const getIndentStyle = depth => `padding-left: ${16 + depth * 20}px`;

  /**
   * Creates the SVG chevron icon used as a collapse toggle.
   */
  const createChevron = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '9');
    svg.setAttribute('height', '9');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polyline'
    );
    path.setAttribute('points', '6 9 12 15 18 9');
    svg.appendChild(path);

    return svg;
  };

  /**
   * Creates a span with a given class and text content.
   * The workhorse of building tree row content.
   */
  const createSpan = (className, text) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };

  /**
   * Returns the CSS value class for a given JSON type and value.
   */
  const getValueClass = (type, value) => {
    if (type === 'null') return 'tree-row__value value--null';
    if (type === 'number') return 'tree-row__value value--number';
    if (type === 'string') return 'tree-row__value value--string';
    if (type === 'boolean') {
      return value
        ? 'tree-row__value value--boolean-true'
        : 'tree-row__value value--boolean-false';
    }
    return 'tree-row__value value--bracket';
  };

  /**
   * Formats a primitive value for display.
   */
  const formatValue = (type, value) => {
    if (type === 'null') return 'null';
    if (type === 'string') return `"${value}"`;
    if (type === 'boolean') return String(value);
    if (type === 'number') return String(value);
    return String(value);
  };

  // Row builders

  /**
   * Builds a single tree row element.
   * Handles both leaf nodes (primitives) and branch nodes (objects/arrays).
   *
   * @param {string} key       - The key name to display (empty string for root)
   * @param {*} value          - The JSON value at this node
   * @param {number} depth     - Current nesting depth (0 = root)
   * @param {string} path      - Dot-notation path to this node
   * @param {Function} onToggle - Called when a branch node is toggled
   * @param {Function} onSelect - Called when any node is clicked
   */
  const buildRow = (key, value, depth, path, onToggle, onSelect) => {
    const type = getType(value);
    const isBranch = type === 'object' || type === 'array';
    const isCollapsed = collapsedPaths.has(path);

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.setAttribute('style', getIndentStyle(depth));
    row.setAttribute('data-path', path);
    row.setAttribute('role', 'treeitem');
    row.setAttribute(
      'aria-expanded',
      isBranch ? String(!isCollapsed) : undefined
    );

    // Toggle or placeholder
    if (isBranch) {
      const toggle = document.createElement('span');
      toggle.className = `tree-row__toggle${isCollapsed ? ' tree-row__toggle--collapsed' : ''}`;
      toggle.setAttribute('aria-label', isCollapsed ? 'Expand' : 'Collapse');
      toggle.appendChild(createChevron());

      toggle.addEventListener('click', e => {
        e.stopPropagation();
        onToggle(path, row);
      });

      row.appendChild(toggle);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'tree-row__toggle-placeholder';
      row.appendChild(placeholder);
    }

    // Key
    if (key !== '') {
      row.appendChild(createSpan('tree-row__key', `"${key}"`));
      row.appendChild(createSpan('tree-row__colon', ':'));
    }

    // Value
    if (isBranch) {
      const openBracket = type === 'object' ? '{' : '[';
      const closeBracket = type === 'object' ? '}' : ']';
      const childCount =
        type === 'object' ? Object.keys(value).length : value.length;
      const childLabel =
        type === 'object'
          ? `${childCount} ${childCount === 1 ? 'key' : 'keys'}`
          : `${childCount} ${childCount === 1 ? 'item' : 'items'}`;

      if (isCollapsed) {
        // Collapsed: show bracket + count badge + close bracket
        row.appendChild(
          createSpan('tree-row__value value--bracket', openBracket)
        );

        const badge = document.createElement('span');
        badge.className = 'tree-row__count';
        badge.textContent = childLabel;
        row.appendChild(badge);

        row.appendChild(
          createSpan('tree-row__value value--bracket', closeBracket)
        );
      } else {
        // Expanded: show only open bracket (children render below)
        row.appendChild(
          createSpan('tree-row__value value--bracket', openBracket)
        );
      }

      // Type badge
      row.appendChild(createSpan('tree-row__type', type));
    } else {
      // Leaf node: show the actual value
      const valueClass = getValueClass(type, value);
      const valueText = formatValue(type, value);
      row.appendChild(createSpan(valueClass, valueText));

      // Type badge
      row.appendChild(createSpan('tree-row__type', type));
    }

    // Click to select and copy path
    row.addEventListener('click', () => onSelect(path, row));

    return row;
  };

  /**
   * Builds a closing bracket row for an object or array.
   */
  const buildClosingRow = (type, depth) => {
    const bracket = type === 'object' ? '}' : ']';
    const row = document.createElement('div');
    row.className = 'tree-row tree-row--closing';
    row.setAttribute('style', getIndentStyle(depth));

    const placeholder = document.createElement('span');
    placeholder.className = 'tree-row__toggle-placeholder';
    row.appendChild(placeholder);

    row.appendChild(createSpan('tree-row__value value--bracket', bracket));
    return row;
  };

  // Public API

  /**
   * Renders a parsed JSON value into a container element.
   * Clears the container before rendering.
   *
   * @param {HTMLElement} container  - The element to render into
   * @param {*}           data       - The parsed JSON value
   * @param {Function}    onSelect   - Called with (path) when a node is clicked
   */
  const render = (container, data, onSelect) => {
    container.innerHTML = '';

    /**
     * Recursive render function.
     * Builds DOM nodes for value and all its descendants.
     */
    const renderNode = (key, value, depth, path) => {
      const type = getType(value);
      const isBranch = type === 'object' || type === 'array';
      const isCollapsed = collapsedPaths.has(path);

      const onToggle = togglePath => {
        if (collapsedPaths.has(togglePath)) {
          collapsedPaths.delete(togglePath);
        } else {
          collapsedPaths.add(togglePath);
        }
        // Re-render everything — simple and correct for Day 8.
        // Day 15 will optimize this with targeted DOM updates.
        render(container, data, onSelect);
      };

      const handleSelect = (selectedPath, rowEl) => {
        // Clear previous selection
        container
          .querySelectorAll('.tree-row--selected')
          .forEach(r => r.classList.remove('tree-row--selected'));
        rowEl.classList.add('tree-row--selected');
        onSelect(selectedPath);
      };

      // Render this node's row
      const row = buildRow(key, value, depth, path, onToggle, handleSelect);
      container.appendChild(row);

      // If collapsed or not a branch, we are done
      if (!isBranch || isCollapsed) return;

      // Render children
      if (type === 'object') {
        Object.entries(value).forEach(([childKey, childValue]) => {
          const childPath = path ? `${path}.${childKey}` : childKey;
          renderNode(childKey, childValue, depth + 1, childPath);
        });
      } else {
        value.forEach((childValue, index) => {
          const childPath = `${path}[${index}]`;
          renderNode(String(index), childValue, depth + 1, childPath);
        });
      }

      // Closing bracket
      container.appendChild(buildClosingRow(type, depth));
    };

    // Start the recursion from the root
    renderNode('', data, 0, '');
  };

  /**
   * Collapses all nodes below a given depth.
   * depth=0 collapses everything. depth=1 collapses only top-level children.
   */
  const collapseToDepth = (data, maxDepth, currentDepth = 0, path = '') => {
    const type = getType(data);
    if (type !== 'object' && type !== 'array') return;
    if (currentDepth >= maxDepth) {
      collapsedPaths.add(path);
      return;
    }
    if (type === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const childPath = path ? `${path}.${key}` : key;
        collapseToDepth(value, maxDepth, currentDepth + 1, childPath);
      });
    } else {
      data.forEach((value, index) => {
        collapseToDepth(value, maxDepth, currentDepth + 1, `${path}[${index}]`);
      });
    }
  };

  const clearCollapsed = () => collapsedPaths.clear();

  return { render, collapseToDepth, clearCollapsed };
};
