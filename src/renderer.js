const createRenderer = () => {
  const collapsedPaths = new Set();
  let focusedPath = null; // path of the keyboard-focused row
  let onSelectCallback = null; // stored so keyboard nav can trigger it

  // Private helpers

  const getIndentStyle = depth => `padding-left: ${16 + depth * 20}px`;

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

  const createSpan = (className, text) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };

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

  const formatValue = (type, value) => {
    if (type === 'null') return 'null';
    if (type === 'string') return `"${value}"`;
    if (type === 'boolean') return String(value);
    if (type === 'number') return String(value);
    return String(value);
  };

  // Subtree operations

  /**
   * Public wrapper: recursively expands the subtree at a given path.
   * Needs the root data to walk from.
   */
  const expandSubtreeAt = (data, path) => {
    const value = getValueAtPath(data, path);
    if (value === undefined) return;
    expandSubtree(value, path);
  };

  /**
   * Public wrapper: recursively collapses the subtree at a given path.
   */
  const collapseSubtreeAt = (data, path) => {
    const value = getValueAtPath(data, path);
    if (value === undefined) return;
    collapseSubtree(value, path);
  };

  // Focus management
  const setFocusedRow = (container, path) => {
    // Clear previous
    container
      .querySelectorAll('.tree-row--focused')
      .forEach(r => r.classList.remove('tree-row--focused'));

    focusedPath = path;

    if (path === null) return;

    const row = container.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (row) {
      row.classList.add('tree-row--focused');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  /**
   * Returns all visible row elements in DOM order.
   * Used by arrow key navigation to find adjacent rows.
   */
  const getVisibleRows = container =>
    Array.from(container.querySelectorAll('.tree-row'));

  // Row builder

  const buildRow = (
    key,
    value,
    depth,
    path,
    onToggle,
    onSelect,
    onDoubleClick
  ) => {
    const type = getType(value);
    const isBranch = type === 'object' || type === 'array';
    const isCollapsed = collapsedPaths.has(path);

    const row = document.createElement('div');
    row.className = `tree-row${isBranch ? ' tree-row--branch' : ''}`;
    row.setAttribute('style', getIndentStyle(depth));
    row.setAttribute('data-path', path);
    row.setAttribute('data-depth', depth);
    row.setAttribute('data-branch', isBranch ? 'true' : 'false');
    row.setAttribute('role', 'treeitem');

    if (isBranch) {
      row.setAttribute('aria-expanded', String(!isCollapsed));
    }

    // Toggle (chevron)
    if (isBranch) {
      const toggle = document.createElement('span');
      toggle.className = `tree-row__toggle${isCollapsed ? ' tree-row__toggle--collapsed' : ''}`;
      toggle.appendChild(createChevron());
      row.appendChild(toggle);
    } else {
      row.appendChild(
        Object.assign(document.createElement('span'), {
          className: 'tree-row__toggle-placeholder',
        })
      );
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
      const childLabel = `${childCount} ${
        type === 'object'
          ? childCount === 1
            ? 'key'
            : 'keys'
          : childCount === 1
            ? 'item'
            : 'items'
      }`;

      if (isCollapsed) {
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
        row.appendChild(
          createSpan('tree-row__value value--bracket', openBracket)
        );
      }

      row.appendChild(createSpan('tree-row__type', type));
    } else {
      row.appendChild(
        createSpan(getValueClass(type, value), formatValue(type, value))
      );
      row.appendChild(createSpan('tree-row__type', type));
    }

    // Events

    // Single click on a branch row: toggle collapse
    // Single click on a leaf row: select and copy path
    row.addEventListener('click', e => {
      e.stopPropagation();

      if (isBranch) {
        onToggle(path);
      } else {
        onSelect(path, row);
      }
    });

    // Double-click on a branch row: recursively expand subtree
    if (isBranch) {
      row.addEventListener('dblclick', e => {
        e.stopPropagation();
        onDoubleClick(path);
      });
    }

    return row;
  };

  const buildClosingRow = (type, depth) => {
    const row = document.createElement('div');
    row.className = 'tree-row tree-row--closing';
    row.setAttribute('style', getIndentStyle(depth));
    row.appendChild(
      Object.assign(document.createElement('span'), {
        className: 'tree-row__toggle-placeholder',
      })
    );
    row.appendChild(
      createSpan(
        'tree-row__value value--bracket',
        type === 'object' ? '}' : ']'
      )
    );
    return row;
  };

  // Public: render

  const render = (container, data, onSelect) => {
    container.innerHTML = '';
    onSelectCallback = onSelect;

    const onToggle = togglePath => {
      if (collapsedPaths.has(togglePath)) {
        collapsedPaths.delete(togglePath);
      } else {
        collapsedPaths.add(togglePath);
      }
      render(container, data, onSelect);
      setFocusedRow(container, togglePath);
    };

    const handleSelect = (selectedPath, rowEl) => {
      container
        .querySelectorAll('.tree-row--selected')
        .forEach(r => r.classList.remove('tree-row--selected'));
      rowEl.classList.add('tree-row--selected');
      setFocusedRow(container, selectedPath);
      onSelect(selectedPath);
    };

    const onDoubleClick = dblPath => {
      // If collapsed: expand the node then recursively expand its children
      // If expanded: recursively collapse all children (but keep the node open)
      if (collapsedPaths.has(dblPath)) {
        expandSubtree(data, dblPath);
      } else {
        collapseSubtree(data, dblPath);
      }
      render(container, data, onSelect);

      // Flash feedback on the double-clicked row
      const row = container.querySelector(
        `[data-path="${CSS.escape(dblPath)}"]`
      );
      if (row) {
        row.classList.add('tree-row--flash');
        row.addEventListener(
          'animationend',
          () => {
            row.classList.remove('tree-row--flash');
          },
          { once: true }
        );
      }

      setFocusedRow(container, dblPath);
    };

    const renderNode = (key, value, depth, path) => {
      const type = getType(value);
      const isBranch = type === 'object' || type === 'array';
      const isCollapsed = collapsedPaths.has(path);

      const row = buildRow(
        key,
        value,
        depth,
        path,
        onToggle,
        handleSelect,
        onDoubleClick
      );
      container.appendChild(row);

      if (!isBranch || isCollapsed) return;

      if (type === 'object') {
        Object.entries(value).forEach(([childKey, childValue]) => {
          const childPath = path ? `${path}.${childKey}` : childKey;
          renderNode(childKey, childValue, depth + 1, childPath);
        });
      } else {
        value.forEach((childValue, index) => {
          renderNode(String(index), childValue, depth + 1, `${path}[${index}]`);
        });
      }

      container.appendChild(buildClosingRow(type, depth));
    };

    renderNode('', data, 0, '');

    // Restore focus to the previously focused row after re-render
    if (focusedPath !== null) {
      setFocusedRow(container, focusedPath);
    }
  };

  // Public: keyboard navigation

  /**
   * Handles arrow key navigation on the tree container.
   * Called from main.js via a keydown listener on the container.
   *
   * ArrowDown  — move focus to next visible row
   * ArrowUp    — move focus to previous visible row
   * ArrowRight — expand focused branch node (or move to first child if open)
   * ArrowLeft  — collapse focused branch node (or move to parent if already collapsed)
   * Enter      — select focused row (copy path)
   * Space      — toggle focused branch node
   */
  const handleKeyNav = (e, container, data, onSelect) => {
    const rows = getVisibleRows(container);
    if (rows.length === 0) return;

    const currentRow =
      focusedPath !== null
        ? container.querySelector(`[data-path="${CSS.escape(focusedPath)}"]`)
        : null;
    const currentIndex = currentRow ? rows.indexOf(currentRow) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, rows.length - 1);
        const nextPath = rows[nextIndex]?.dataset.path ?? null;
        setFocusedRow(container, nextPath);
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        const prevPath = rows[prevIndex]?.dataset.path ?? null;
        setFocusedRow(container, prevPath);
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (!currentRow) break;
        const isBranch = currentRow.dataset.branch === 'true';
        if (!isBranch) break;

        if (collapsedPaths.has(focusedPath)) {
          // Expand
          collapsedPaths.delete(focusedPath);
          render(container, data, onSelect);
        } else {
          // Already open — move to first child
          const nextRow = rows[currentIndex + 1];
          if (nextRow) setFocusedRow(container, nextRow.dataset.path);
        }
        break;
      }

      case 'ArrowLeft': {
        e.preventDefault();
        if (!currentRow) break;
        const isBranch = currentRow.dataset.branch === 'true';

        if (isBranch && !collapsedPaths.has(focusedPath)) {
          // Collapse
          collapsedPaths.add(focusedPath);
          render(container, data, onSelect);
        } else {
          // Move to parent row
          const currentDepth = parseInt(currentRow.dataset.depth, 10);
          const parentRow = rows
            .slice(0, currentIndex)
            .reverse()
            .find(r => parseInt(r.dataset.depth, 10) < currentDepth);
          if (parentRow) setFocusedRow(container, parentRow.dataset.path);
        }
        break;
      }

      case 'Enter': {
        e.preventDefault();
        if (!currentRow || !focusedPath) break;
        // Select: copy path
        container
          .querySelectorAll('.tree-row--selected')
          .forEach(r => r.classList.remove('tree-row--selected'));
        currentRow.classList.add('tree-row--selected');
        if (onSelectCallback) onSelectCallback(focusedPath);
        break;
      }

      case ' ': {
        e.preventDefault();
        if (!currentRow) break;
        const isBranch = currentRow.dataset.branch === 'true';
        if (!isBranch) break;
        if (collapsedPaths.has(focusedPath)) {
          collapsedPaths.delete(focusedPath);
        } else {
          collapsedPaths.add(focusedPath);
        }
        render(container, data, onSelect);
        break;
      }
    }
  };

  //  Public: collapse to depth

  /**
   * Collapses all nodes at depth >= maxDepth.
   * depth=0 means show only the root node collapsed.
   * depth=1 means show top-level keys but collapse their children.
   */
  const collapseToDepth = (data, maxDepth, currentDepth = 0, path = '') => {
    const type = getType(data);
    if (type !== 'object' && type !== 'array') return;

    if (currentDepth >= maxDepth) {
      if (path !== '') collapsedPaths.add(path);
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

  const clearCollapsed = () => {
    collapsedPaths.clear();
    focusedPath = null;
  };

  const expandAll = () => collapsedPaths.clear();

  const collapseAll = data => {
    collapseToDepth(data, 0);
  };

  /**
   * Removes a set of paths from collapsedPaths.
   * Ussed by search to expand ancestors of matching nodes.
   */
  const expandPaths = paths => {
    paths.forEach(path => collapsedPaths.delete(path));
  };

  return {
    render,
    handleKeyNav,
    collapseToDepth,
    collapseAll,
    expandAll,
    expandPaths,
    expandSubtreeAt,
    collapseSubtreeAt,
    clearCollapsed,
  };
};
