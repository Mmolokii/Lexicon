// fetcher.js
// Responsible for loading JSON from a URL.
// Returns a typed result object — same shape as parseJSON in parser.js.
// Never throws. Handles: network errors, non-200 responses,
// non-JSON responses, timeouts, and intentional aborts.

const FETCH_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Fetches a URL and attempts to parse the response as JSON.
 *
 * Returns:
 *   { ok: true,  data, raw, url, duration }
 *   { ok: false, error, type, url }
 *
 * error types:
 *   'abort'    — request was intentionally cancelled
 *   'timeout'  — request exceeded FETCH_TIMEOUT_MS
 *   'network'  — DNS failure, no internet, CORS block
 *   'http'     — server returned non-200 status
 *   'parse'    — response was not valid JSON
 */
const fetchJSON = async (url, signal) => {
  const startTime = Date.now();

  // Basic URL validation before making any network request
  try {
    new URL(url);
  } catch {
    return {
      ok: false,
      error: `Invalid URL: "${url}"`,
      type: 'network',
      url,
    };
  }

  // Timeout via AbortController
  // We create our own controller for the timeout, separate from
  // any external signal passed in (the cancel button uses a different one)
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    FETCH_TIMEOUT_MS
  );

  // Combine the external cancel signal with our timeout signal.
  // Either one aborting will abort the fetch.
  const combinedSignal = signal
    ? combineSignals(signal, timeoutController.signal)
    : timeoutController.signal;

  try {
    const response = await fetch(url, {
      signal: combinedSignal,
      headers: {
        // Tell the server we want JSON
        Accept: 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);

    // HTTP error (404, 500, etc.)
    // fetch only rejects on network failure — HTTP errors resolve normally
    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status} ${response.statusText}`,
        type: 'http',
        url,
      };
    }

    // Read the response body as text first
    // so we can show the raw string and also try to parse it
    const raw = await response.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return {
        ok: false,
        error: `Response is not valid JSON: ${parseErr.message}`,
        type: 'parse',
        url,
      };
    }

    const duration = Date.now() - startTime;

    return {
      ok: true,
      data,
      raw,
      url,
      duration, // used to show "Loaded in 312ms"
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // AbortError fires for both intentional cancels and timeouts
    if (err.name === 'AbortError') {
      // Distinguish timeout from intentional cancel
      if (timeoutController.signal.aborted) {
        return {
          ok: false,
          error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
          type: 'timeout',
          url,
        };
      }
      return {
        ok: false,
        error: 'Request cancelled',
        type: 'abort',
        url,
      };
    }

    // Network error: offline, DNS failure, CORS
    return {
      ok: false,
      error:
        err.message || 'Network error — check your connection and CORS policy',
      type: 'network',
      url,
    };
  }
};

/**
 * Combines two AbortSignals into one.
 * The returned signal aborts when either input signal aborts.
 */
const combineSignals = (signal1, signal2) => {
  const controller = new AbortController();

  const abort = () => controller.abort();

  signal1.addEventListener('abort', abort, { once: true });
  signal2.addEventListener('abort', abort, { once: true });

  return controller.signal;
};
