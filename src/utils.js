// utils.js
// Shared utility functions.
// No DOM access. No state. Pure functions only.

/**
 * Returns the JavaScript type of a value as a string.
 * More specific than typeof — distinguishes null, array, object.
 */
const getType = value => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/**
 * Returns a human-readable size string for a JSON string.
 * e.g. "~1.2KB"
 */
const getSize = jsonString => {
  const bytes = new TextEncoder().encode(jsonString).length;
  if (bytes < 1024) return `~${bytes}B`;
  return `~${(bytes / 1024).toFixed(1)}KB`;
};

/**
 * Counts the total number of nodes in a parsed JSON value.
 * Objects and arrays count as 1 each, plus their children.
 */
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

/**
 * Returns the maximum nesting depth of a parsed JSON value.
 */
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

/**
 * Copies a string to the clipboard.
 * Returns a promise that resolves to true on success, false on failure.
 */
const copyToClipboard = async text => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
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

/**
 * Formats a JSON string with 2-space indentation.
 * Returns null if the string is not valid JSON.
 */
const formatJSON = jsonString => {
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  } catch {
    return null;
  }
};

/**
 * Debounce — delays fn execution until after delay ms have elapsed
 * since the last call. Returns a function.
 */
const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
