/**
 * Returns all currently focusable elements inside a container.
 * Filters out disabled elements and elements hidden from the
 * accessibility tree.
 */
const getFocusableElements = container => {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(selectors)).filter(el => {
    // Exclude elements that are visually hidden or inside hidden parents
    return !el.closest('[hidden]') && el.offsetParent !== null;
  });
};

/**
 * Creates a focus trap for a given container.
 *
 * Usage:
 *   const trap = createFocusTrap(containerEl);
 *   trap.activate();   // traps focus, saves previous focus
 *   trap.deactivate(); // releases trap, restores previous focus
 */
const createFocusTrap = container => {
  let previouslyFocused = null;
  let isActive = false;

  const handleKeyDown = e => {
    if (!isActive || e.key !== 'Tab') return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;

    if (e.shiftKey) {
      // Shift+Tab — going backward
      if (current === first || !container.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab — going forward
      if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const activate = () => {
    if (isActive) return;
    isActive = true;

    // Save which element had focus before the trap activated
    previouslyFocused = document.activeElement;

    // Move focus to the first focusable element inside the container
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      // If nothing is focusable, focus the container itself
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
  };

  const deactivate = () => {
    if (!isActive) return;
    isActive = false;

    document.removeEventListener('keydown', handleKeyDown);

    // Return focus to where it was before
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  };

  return { activate, deactivate };
};
