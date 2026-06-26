const parseJSON = input => {
  // Guard: empty or whitespace-only input
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Input is empty',
      position: null,
    };
  }

  try {
    const data = JSON.parse(trimmed);
    return {
      ok: true,
      data,
      raw: trimmed,
    };
  } catch (err) {
    // Extract position from error message when available.
    // Browsers format these differently — we try to extract what we can.
    const positionMatch =
      err.message.match(/position (\d+)/i) || err.message.match(/at (\d+)/i);

    return {
      ok: false,
      error: err.message,
      position: positionMatch ? parseInt(positionMatch[1], 10) : null,
    };
  }
};
